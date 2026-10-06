<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\RenewPressingLicenseRequest;
use App\Http\Requests\Platform\StorePressingRequest;
use App\Http\Requests\Platform\UpdatePressingRequest;
use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\AppSetting;
use App\Models\License;
use App\Models\LoyaltyTier;
use App\Models\PlatformAuditLog;
use App\Models\PlatformPlan;
use App\Models\Pressing;
use App\Models\Role;
use App\Models\User;
use App\Services\LicenseService;
use Database\Seeders\LoyaltyTierSeeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PressingController extends PlatformApiController
{
    private const LICENSE_FIELDS = ['platform_plan_id', 'license_starts_at', 'license_expires_at'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Pressing::query()->with('platformPlan')->latest();

        $pressingIds = $this->resolvePressingFilter($user);
        if ($pressingIds !== null) {
            $query->whereIn('id', $pressingIds);
        }

        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($q) => $q->where('name', 'ilike', "%{$search}%")->orWhere('code', 'ilike', "%{$search}%"));
        }

        if ($request->filled('country_code')) {
            $query->where('country_code', $request->string('country_code'));
        }

        if ($request->filled('platform_plan_id')) {
            $query->where('platform_plan_id', $request->integer('platform_plan_id'));
        }

        if ($request->string('status')->toString() === 'renewal_due') {
            $query->whereNotNull('license_expires_at')
                ->where('license_expires_at', '>', now())
                ->where('license_expires_at', '<=', now()->addDays(30));
        } elseif ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return response()->json($query->paginate($request->integer('per_page', 15)));
    }

    /**
     * Provisionnement réel (pivot multi-tenant, voir CLAUDE.md « Pivot
     * multi-tenant ») : crée le pressing ET sa première agence ET un compte
     * manager bootstrap, dans la même transaction — avant cette passe, créer un
     * pressing n'était qu'une ligne de registre, sans aucun espace réellement
     * utilisable derrière. Des agences supplémentaires s'ajoutent ensuite via
     * l'écran /agencies existant (déjà un CRUD complet, maintenant scopé par
     * pressing), pas re-fabriqué ici.
     */
    public function store(StorePressingRequest $request): JsonResponse
    {
        // Pas de vérification d'affectation ici : un pressing n'existe pas encore,
        // donc rien à affecter — la permission pressings.manage suffit.
        $this->authorizePermission($request->user(), 'pressings.manage');

        $data = $request->validated();
        $pressingFields = Arr::except($data, [
            'agency_code', 'agency_name', 'agency_city', 'manager_name', 'manager_email',
            'primary_color', 'secondary_color', 'security_policy', 'workshop_steps', 'loyalty_tiers',
        ]);

        $managerTemporaryPassword = Str::password(12);

        [$pressing, $reportToken] = DB::transaction(function () use ($data, $pressingFields, $managerTemporaryPassword) {
            $pressing = Pressing::create($pressingFields);
            $reportToken = $pressing->generateReportToken();

            $agency = Agency::create([
                'pressing_id' => $pressing->id,
                'code' => $data['agency_code'],
                'name' => $data['agency_name'],
                'city' => $data['agency_city'] ?? null,
            ]);

            $adminRole = Role::where('slug', 'admin')->firstOrFail();

            User::create([
                'pressing_id' => $pressing->id,
                'agency_id' => null,
                'role_id' => $adminRole->id,
                'name' => $data['manager_name'],
                'email' => $data['manager_email'],
                'password' => Hash::make($managerTemporaryPassword),
                'is_active' => true,
                'must_change_password' => true,
            ]);

            // Essai de 30 jours — valeur par défaut documentée (CLAUDE.md), pas une
            // fabrication côté affichage. Avant cette ligne, un pressing nouvellement
            // provisionné n'avait aucune licence tant qu'une n'était pas auto-créée au
            // premier accès ; la créer ici permet de l'afficher dans la réponse.
            $license = License::current($pressing->id);
            $pressing->update(['license_expires_at' => $license->expires_at]);

            // Valeurs par défaut à la provision (Chantier D.2, CLAUDE.md) — seuls les
            // champs réellement fournis sont appliqués (jamais null écrasant un défaut
            // DB sûr) : couleurs de marque + politique de sécurité (AppSetting, pressing),
            // workflow atelier (AgencySetting, première agence seulement).
            $appSettingFields = Arr::only($data, ['primary_color', 'secondary_color']);
            $appSettingFields = array_merge($appSettingFields, Arr::only($data['security_policy'] ?? [], [
                'session_timeout_minutes', 'password_min_length', 'password_require_uppercase',
                'password_require_number', 'password_require_symbol', 'password_expiry_days',
            ]));
            $appSettingFields = array_filter($appSettingFields, fn ($v) => $v !== null);
            if ($appSettingFields !== []) {
                AppSetting::current($pressing->id)->update($appSettingFields);
            }

            $workshopStepFields = array_filter(
                Arr::only($data['workshop_steps'] ?? [], ['washer_step_enabled', 'sorter_step_enabled']),
                fn ($v) => $v !== null
            );
            if ($workshopStepFields !== []) {
                AgencySetting::forAgency($agency->id)->update($workshopStepFields);
            }

            // Programme de fidélité par défaut — si omis, repli sur les 3 paliers déjà
            // seedés ailleurs (LoyaltyTierSeeder::TIERS) : jamais un pressing provisionné
            // sans aucun palier fonctionnel (même garantie que le backfill du Chantier D.1).
            $tiers = $data['loyalty_tiers'] ?? LoyaltyTierSeeder::TIERS;
            foreach ($tiers as $tier) {
                LoyaltyTier::create([
                    'pressing_id' => $pressing->id,
                    'name' => $tier['name'],
                    'min_points' => $tier['min_points'],
                    'discount_rate' => $tier['discount_rate'],
                    'is_active' => true,
                ]);
            }

            return [$pressing, $reportToken];
        });

        return response()->json(
            $pressing->fresh('platformPlan')->toArray() + [
                'report_token' => $reportToken,
                'manager_email' => $data['manager_email'],
                'manager_temporary_password' => $managerTemporaryPassword,
            ],
            201
        );
    }

    /**
     * Enrichi pour la fiche détail (CLAUDE.md « Fiche détail d'un pressing ») :
     * compteur d'agences réel + historique des paiements de licence. `index()`
     * n'a pas besoin de ce poids par ligne, seule cette méthode le charge.
     */
    public function show(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        // Chantier « Re-audit Pressing — quotas de licence » (CLAUDE.md) : même décision
        // déjà actée pour agencies_count — compte réel, pas la colonne dénormalisée
        // alimentée par les rapports périodiques, pour cette vue à un seul pressing.
        $pressing->loadCount(['agencies', 'users'])
            ->load(['platformPlan', 'license.payments' => fn ($q) => $q->latest('paid_at')]);

        $payload = $pressing->toArray();
        if ($pressing->license) {
            // Même formule que LicenseController::show() (tenant) — days_remaining n'est
            // pas un attribut persistant du modèle, calculé à la volée des deux côtés.
            $payload['license']['days_remaining'] = (int) now()->diffInDays($pressing->license->expires_at, false);
        }

        return response()->json($payload);
    }

    /**
     * Agences du pressing avec compteurs réels — « dépôts actifs » définis comme
     * l'Atelier/MultiAgencyService (statuts recu→pret), jamais une valeur fabriquée.
     */
    public function agencies(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        $activeOrderStatuses = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret'];

        $agencies = $pressing->agencies()
            ->withCount([
                'users',
                'orders as active_orders_count' => fn ($q) => $q->whereIn('status', $activeOrderStatuses),
            ])
            ->orderBy('name')
            ->get();

        return response()->json($agencies);
    }

    /**
     * Chantier « Re-audit Pressing — édition post-création » (CLAUDE.md) : lecture
     * des réglages réellement éditables (couleurs/sécurité depuis `AppSetting`,
     * programme de fidélité depuis `LoyaltyTier`) — jamais depuis la colonne
     * `Pressing` elle-même, qui ne les porte pas.
     */
    public function settings(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        $appSetting = AppSetting::current($pressing->id);
        $tiers = LoyaltyTier::where('pressing_id', $pressing->id)->where('is_active', true)->orderBy('min_points')->get();

        return response()->json([
            'primary_color' => $appSetting->primary_color,
            'secondary_color' => $appSetting->secondary_color,
            'security_policy' => [
                'session_timeout_minutes' => $appSetting->session_timeout_minutes,
                'password_min_length' => $appSetting->password_min_length,
                'password_require_uppercase' => $appSetting->password_require_uppercase,
                'password_require_number' => $appSetting->password_require_number,
                'password_require_symbol' => $appSetting->password_require_symbol,
                'password_expiry_days' => $appSetting->password_expiry_days,
            ],
            'loyalty_tiers' => $tiers,
        ]);
    }

    public function update(UpdatePressingRequest $request, Pressing $pressing): JsonResponse
    {
        $user = $request->user();
        $this->authorizePressing($user, $pressing->id);

        $data = $request->validated();
        $touchesOnlyLicenseFields = array_diff(array_keys($data), self::LICENSE_FIELDS) === [];

        // Les champs de licence sont accessibles à qui a licenses.manage OU pressings.manage ;
        // tout autre champ (nom, code, contact...) exige pressings.manage — rend la 4e
        // permission de la maquette réellement signifiante plutôt que cosmétique.
        if ($touchesOnlyLicenseFields && $data !== []) {
            if (! $user->hasPermission('licenses.manage') && ! $user->hasPermission('pressings.manage')) {
                $this->authorizePermission($user, 'licenses.manage');
            }
        } else {
            $this->authorizePermission($user, 'pressings.manage');
        }

        $pressingFields = Arr::except($data, ['primary_color', 'secondary_color', 'security_policy', 'loyalty_tiers']);

        DB::transaction(function () use ($data, $pressingFields, $pressing) {
            $pressing->update($pressingFields);

            $appSettingFields = Arr::only($data, ['primary_color', 'secondary_color']);
            $appSettingFields = array_merge($appSettingFields, Arr::only($data['security_policy'] ?? [], [
                'session_timeout_minutes', 'password_min_length', 'password_require_uppercase',
                'password_require_number', 'password_require_symbol', 'password_expiry_days',
            ]));
            $appSettingFields = array_filter($appSettingFields, fn ($v) => $v !== null);
            if ($appSettingFields !== []) {
                AppSetting::current($pressing->id)->update($appSettingFields);
            }

            if (array_key_exists('loyalty_tiers', $data)) {
                $this->syncLoyaltyTiers($pressing, $data['loyalty_tiers']);
            }
        });

        return response()->json($pressing->fresh('platformPlan'));
    }

    /**
     * Upsert avec désactivation douce — jamais de suppression dure (même convention
     * que `TreatmentTypeController`/`LoyaltyTierController` : `is_active` plutôt que
     * `destroy`, pour ne jamais casser l'historique des dépôts déjà facturés avec ce
     * palier). Un tier absent du tableau soumis (retiré côté UI) est désactivé, pas
     * supprimé.
     *
     * @param  array<int,array{id?:int,name:string,min_points:int,discount_rate:float}>  $tiers
     */
    private function syncLoyaltyTiers(Pressing $pressing, array $tiers): void
    {
        $submittedIds = collect($tiers)->pluck('id')->filter()->all();

        LoyaltyTier::where('pressing_id', $pressing->id)
            ->where('is_active', true)
            ->whereNotIn('id', $submittedIds === [] ? [0] : $submittedIds)
            ->update(['is_active' => false]);

        foreach ($tiers as $tier) {
            $fields = [
                'name' => $tier['name'],
                'min_points' => $tier['min_points'],
                'discount_rate' => $tier['discount_rate'],
                'is_active' => true,
            ];

            if (! empty($tier['id'])) {
                $existing = LoyaltyTier::where('pressing_id', $pressing->id)->find($tier['id']);
                if ($existing === null) {
                    throw new HttpException(404, "Palier de fidélité introuvable pour ce pressing.");
                }
                $existing->update($fields);
            } else {
                LoyaltyTier::create(['pressing_id' => $pressing->id, ...$fields]);
            }
        }
    }

    public function suspend(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        $pressing->update(['status' => 'suspended']);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function reactivate(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        $pressing->update(['status' => 'active']);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function rotateReportToken(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        return response()->json(['report_token' => $pressing->generateReportToken()]);
    }

    /**
     * Renouvellement confirmé par Spark (v1 : règlement cash/Mobile Money déjà perçu,
     * voir CLAUDE.md « Licence / facturation — gap d'harmonisation ») — seule action
     * qui prolonge `licenses.expires_at`, désormais exclusivement côté plateforme.
     */
    public function renew(RenewPressingLicenseRequest $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        $plan = PlatformPlan::findOrFail($request->validated('platform_plan_id'));
        $license = License::current($pressing->id);

        $payment = app(LicenseService::class)->renew(
            $license,
            $plan,
            $request->validated('method'),
            $request->validated('external_reference')
        );

        return response()->json([
            'license' => $license->fresh(),
            'payment' => $payment,
        ], 201);
    }

    /**
     * Impersonation support (Phase 4) : connecte le superadmin « en tant que » le
     * compte manager bootstrap du pressing, pour diagnostiquer un problème sans
     * demander les identifiants du client. Action la plus sensible de la console —
     * permission dédiée (`pressings.impersonate`, superadmin uniquement par défaut),
     * tracée dans le journal d'audit plateforme. Le jeton émis n'a pas d'expiration
     * dédiée (même mécanisme qu'un jeton de connexion ordinaire) — à révoquer
     * manuellement si besoin via la déconnexion du compte impersonné.
     */
    public function impersonate(Request $request, Pressing $pressing): JsonResponse
    {
        $actor = $request->user();
        $this->authorizePermission($actor, 'pressings.impersonate');
        $this->authorizePressing($actor, $pressing->id);

        $tenantUser = User::where('pressing_id', $pressing->id)
            ->whereNull('agency_id')
            ->whereHas('role', fn ($query) => $query->where('slug', 'admin'))
            ->where('is_active', true)
            ->oldest('id')
            ->first();

        if ($tenantUser === null) {
            throw new HttpException(404, "Aucun compte administrateur global actif n'a été trouvé pour ce pressing.");
        }

        $token = $tenantUser->createToken('platform-impersonation:'.$actor->id);

        PlatformAuditLog::create([
            'platform_user_id' => $actor->id,
            'action' => 'pressing.impersonated',
            'auditable_type' => Pressing::class,
            'auditable_id' => $pressing->id,
            'new_values' => ['tenant_user_id' => $tenantUser->id, 'tenant_user_email' => $tenantUser->email],
        ]);

        return response()->json([
            'token' => $token->plainTextToken,
            'tenant_user' => ['id' => $tenantUser->id, 'name' => $tenantUser->name, 'email' => $tenantUser->email],
            'pressing' => ['id' => $pressing->id, 'name' => $pressing->name, 'code' => $pressing->code],
        ]);
    }
}
