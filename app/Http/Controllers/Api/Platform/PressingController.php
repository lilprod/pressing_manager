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

        $query = Pressing::query()->with('platformPlan')
            // Comptes réels + incidents ouverts (registre) + responsable (manager bootstrap).
            ->withCount([
                'agencies as live_agencies_count' => fn ($q) => $q->where('is_active', true),
                'users as live_users_count' => fn ($q) => $q->where('is_active', true),
                'incidents as open_incidents_count' => fn ($q) => $q->where('status', 'open'),
            ])
            ->withMax('orders as last_activity_at', 'orders.created_at')
            ->latest();

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
        } elseif ($request->string('status')->toString() === 'incident') {
            $query->whereHas('incidents', fn ($q) => $q->where('status', 'open'));
        } elseif ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        $page = $query->paginate($request->integer('per_page', 15));
        $managers = \App\Models\User::query()
            ->whereIn('pressing_id', $page->getCollection()->pluck('id'))
            ->whereNull('agency_id')
            ->whereHas('role', fn ($r) => $r->where('slug', 'admin'))
            ->orderBy('id')
            ->get(['id', 'pressing_id', 'name', 'email'])
            ->unique('pressing_id')
            ->keyBy('pressing_id');
        $priorities = \App\Models\PlatformIncident::query()->where('status', 'open')
            ->whereIn('pressing_id', $page->getCollection()->pluck('id'))
            ->get(['pressing_id', 'priority'])
            ->groupBy('pressing_id')
            ->map(fn ($rows) => $rows->min('priority'))
            ->all();
        $page->getCollection()->each(function (Pressing $p) use ($managers, $priorities) {
            $p->setAttribute('manager', $managers[$p->id] ?? null);
            $this->decorate($p, $priorities);
        });

        return response()->json($page);
    }

    /** Export CSV du registre (mêmes filtres que la liste, non paginé). */
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $request->merge(['per_page' => 10000]);
        $rows = $this->index($request)->getData(true)['data'];

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Code', 'Pressing', 'Pays', 'Responsable', 'Plan', 'Agences', 'Utilisateurs', 'Licence jusqu\'au', 'Statut', 'Incidents ouverts'], ';');
            foreach ($rows as $r) {
                fputcsv($out, [
                    $r['code'], $r['name'], $r['country_code'], $r['manager']['name'] ?? '', $r['platform_plan']['name'] ?? '',
                    $r['live_agencies_count'], $r['live_users_count'], $r['license_expires_at'] ? substr($r['license_expires_at'], 0, 10) : '',
                    $r['status'], $r['open_incidents_count'],
                ], ';');
            }
            fclose($out);
        }, 'pressings-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** Écran « Licences » : licence réelle de chaque pressing + dernier paiement. */
    public function licenses(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $pressingIds = $this->resolvePressingFilter($user);

        $rows = Pressing::query()
            ->with(['platformPlan:id,name,price,currency', 'license.payments' => fn ($q) => $q->latest('paid_at')])
            ->when($pressingIds !== null, fn ($q) => $q->whereIn('id', $pressingIds))
            ->orderBy('license_expires_at')
            ->get()
            ->map(function (Pressing $p) {
                $last = $p->license?->payments->first();

                return [
                    'pressing' => $p->only(['id', 'name', 'code', 'status']),
                    'plan' => $p->platformPlan?->only(['id', 'name', 'price', 'currency']),
                    'license_status' => $p->license?->status,
                    'expires_at' => $p->license?->expires_at ?? $p->license_expires_at,
                    'days_remaining' => ($p->license?->expires_at ?? $p->license_expires_at) ? (int) now()->diffInDays($p->license?->expires_at ?? $p->license_expires_at, false) : null,
                    'last_payment' => $last ? ['amount' => $last->amount, 'method' => $last->method, 'paid_at' => $last->paid_at] : null,
                ];
            });

        return response()->json($rows->values());
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
                    'min_spend_amount' => $tier['min_spend_amount'],
                    'discount_rate' => $tier['discount_rate'],
                    'point_multiplier' => $tier['point_multiplier'] ?? 1.0,
                    'benefit_description' => $tier['benefit_description'] ?? null,
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
    /**
     * Synthèse de la fiche pressing (« Vue d'ensemble ») : tout est lu en direct dans la
     * base partagée — agences, personnel, licence, incidents, configuration par agence,
     * dépôts rejoués depuis la file hors ligne. Aucune métrique de santé technique
     * (API/synchro/impression) : aucune télémétrie de ce type n'existe.
     */
    public function overview(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);
        $pressing->loadMissing(['platformPlan', 'license']);

        $agencies = $pressing->agencies()->with('settings')->withCount('users')->orderBy('name')->get();
        $users = \App\Models\User::query()->where('pressing_id', $pressing->id)->with('role:id,slug,name')->get(['id', 'name', 'role_id', 'is_active', 'last_login_at']);

        $byRole = $users->where('is_active', true)->groupBy(fn ($u) => $u->role?->name ?? '—')
            ->map(fn ($group, $role) => [
                'role' => $role,
                'count' => $group->count(),
                'initials' => collect(explode(' ', (string) $group->first()->name))->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->implode(''),
            ])->values();

        $incidents = \App\Models\PlatformIncident::query()->where('pressing_id', $pressing->id)->where('status', '!=', 'resolved')
            ->get(['id', 'title', 'priority', 'created_at']);
        $health = $incidents->isEmpty() ? 'sain' : ($incidents->contains('priority', 'P1') ? 'incident' : 'degrade');

        $license = $pressing->license;
        $starts = $license?->starts_at ?? $pressing->license_starts_at;
        $expires = $license?->expires_at ?? $pressing->license_expires_at;
        $consumed = null;
        if ($starts && $expires && $expires->gt($starts)) {
            $consumed = (int) round(min(100, max(0, $starts->diffInSeconds(now()) / $starts->diffInSeconds($expires) * 100)));
        }

        $formats = $agencies->map(fn ($a) => $a->formatOrderNumber(1))->unique()->values();
        $offlineEnabled = $agencies->filter(fn ($a) => $a->settings?->offline_enabled ?? true)->count();
        $retentions = $agencies->map(fn ($a) => $a->settings?->offline_retention_days)->filter()->unique()->values();

        $offlineOrders = \App\Models\Order::query()->whereIn('agency_id', $agencies->pluck('id'))->where('source', 'offline_sync')
            ->with('agency')->latest()->limit(5)->get(['id', 'agency_id', 'order_number', 'client_local_uuid', 'created_at'])
            ->map(fn ($o) => [
                'id' => $o->id,
                'number' => $o->agency?->formatOrderNumber($o->order_number) ?? (string) $o->order_number,
                'agency_name' => $o->agency?->name,
                'created_at' => $o->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'agencies' => $agencies->map(fn ($a) => [
                'id' => $a->id, 'name' => $a->name, 'city' => $a->city, 'is_active' => (bool) $a->is_active, 'users_count' => $a->users_count,
            ])->values(),
            'agencies_active' => $agencies->where('is_active', true)->count(),
            'agencies_total' => $agencies->count(),
            'users_total' => $users->count(),
            'users_active_30d' => $users->filter(fn ($u) => $u->last_login_at && $u->last_login_at->gte(now()->subDays(30)))->count(),
            'users_by_role' => $byRole,
            'license' => [
                'plan' => $pressing->platformPlan?->name,
                'starts_at' => $starts?->toIso8601String(),
                'expires_at' => $expires?->toIso8601String(),
                'days_remaining' => $expires ? (int) now()->diffInDays($expires, false) : null,
                'consumed_pct' => $consumed,
                'agencies_limit' => $pressing->platformPlan?->agencies_limit,
                'users_limit' => $pressing->platformPlan?->users_limit,
                'storage_limit_gb' => $pressing->platformPlan?->storage_limit_gb,
            ],
            'health' => $health,
            'open_incidents' => $incidents->map(fn ($i) => ['id' => $i->id, 'title' => $i->title, 'priority' => $i->priority])->values(),
            'configuration' => [
                'timezone' => config('app.timezone'),
                'numbering_formats' => $formats,
                'offline_enabled_count' => $offlineEnabled,
                'offline_retention_days' => $retentions,
            ],
            'offline_orders' => $offlineOrders,
            'offline_orders_total' => \App\Models\Order::query()->whereIn('agency_id', $agencies->pluck('id'))->where('source', 'offline_sync')->count(),
        ]);
    }

    /** Journal d'activité du tenant (audit des agences + connexions du personnel). */
    public function activity(Request $request, Pressing $pressing, \App\Services\PressingActivityService $service): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        return response()->json($service->paginate($pressing, $this->activityFilters($request), min(50, max(5, $request->integer('per_page', 10)))));
    }

    public function activityExport(Request $request, Pressing $pressing, \App\Services\PressingActivityService $service): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);
        $rows = $service->all($pressing, $this->activityFilters($request));

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'Source', 'Objet', 'Action', 'Acteur', 'Rôle', 'Agence', 'Ressource', 'Adresse IP', 'Résultat']);
            foreach ($rows as $r) {
                fputcsv($out, [$r['created_at'], $r['source'], $r['subject'], $r['kind'], $r['actor_name'], $r['actor_role'], $r['agency_name'], $r['resource_id'], $r['ip_address'], $r['result'] === 'failure' ? 'Échec' : 'Succès']);
            }
            fclose($out);
        }, 'journal-'.$pressing->code.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function activityFilters(Request $request): array
    {
        $filters = $request->only(['category', 'agency_id', 'result', 'search', 'from', 'to']);
        $period = $request->string('period')->value();
        if ($period && empty($filters['from'])) {
            $filters['from'] = match ($period) {
                'day' => now()->toDateString(),
                'week' => now()->subDays(6)->toDateString(),
                'month' => now()->subDays(29)->toDateString(),
                default => null,
            };
        }

        return $filters;
    }

    public function settings(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        $appSetting = AppSetting::current($pressing->id);
        $tiers = LoyaltyTier::where('pressing_id', $pressing->id)->where('is_active', true)->orderBy('min_spend_amount')->get();

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
     * @param  array<int,array{id?:int,name:string,min_spend_amount:int,discount_rate:float,point_multiplier?:float,benefit_description?:?string}>  $tiers
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
                'min_spend_amount' => $tier['min_spend_amount'],
                'discount_rate' => $tier['discount_rate'],
                'point_multiplier' => $tier['point_multiplier'] ?? 1.0,
                'benefit_description' => $tier['benefit_description'] ?? null,
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
        $this->notifyManager($pressing, 'suspended');

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function reactivate(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        $pressing->update(['status' => 'active']);
        $this->notifyManager($pressing, 'reactivated');

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

        $fresh = $license->fresh();
        $this->notifyManager($pressing, 'renewed', $fresh?->expires_at ? 'Nouvelle échéance : '.$fresh->expires_at->format('d/m/Y').'.' : null);

        return response()->json([
            'license' => $fresh,
            'payment' => $payment,
        ], 201);
    }

    /** Compte manager bootstrap du pressing (même règle que la colonne Responsable). */
    private function managerOf(Pressing $pressing): ?\App\Models\User
    {
        return \App\Models\User::query()->where('pressing_id', $pressing->id)->whereNull('agency_id')
            ->whereHas('role', fn ($r) => $r->where('slug', 'admin'))->where('is_active', true)->orderBy('id')->first();
    }

    private function notifyManager(Pressing $pressing, string $event, ?string $detail = null): void
    {
        $this->managerOf($pressing)?->notify(new \App\Notifications\PressingAccountChangedNotification($event, $pressing->name, $detail));
    }

    /**
     * États dérivés d'un pressing, uniquement à partir de données réelles :
     * - santé : registre d'incidents (P1 ouvert → incident, P2/P3 → dégradé, aucun → sain) ;
     * - licence : échéance réelle (expirée / à renouveler ≤ 30 j / active) ;
     * - synchronisation : âge du dernier rapport pour un pressing déployé ailleurs ;
     *   un pressing hébergé ici n'envoie pas de rapport — ses données sont en direct.
     */
    private function decorate(Pressing $p, array $incidentPriorities): void
    {
        $priority = $incidentPriorities[$p->id] ?? null;
        $p->setAttribute('health', $priority === null ? 'sain' : ($priority === 'P1' ? 'incident' : 'degrade'));

        $expires = $p->license_expires_at;
        $p->setAttribute('license_state', $expires === null ? null : ($expires->isPast() ? 'expired' : ($expires->lte(now()->addDays(30)) ? 'renewal_due' : 'active')));

        $hosted = ($p->live_agencies_count ?? 0) > 0;
        if ($hosted) {
            $p->setAttribute('sync_state', 'live');
        } elseif ($p->last_report_at === null) {
            $p->setAttribute('sync_state', 'never');
        } else {
            $minutes = (int) $p->last_report_at->diffInMinutes(now());
            $p->setAttribute('sync_state', $minutes <= 30 ? 'synced' : ($minutes <= 24 * 60 ? 'late' : 'offline'));
            $p->setAttribute('sync_delay_minutes', $minutes);
        }
    }

    /** Indicateurs de l'écran Pressings (même périmètre que la liste). */
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $pressingIds = $this->resolvePressingFilter($user);
        $scope = fn () => Pressing::query()->when($pressingIds !== null, fn ($q) => $q->whereIn('id', $pressingIds));
        $incidents = fn () => \App\Models\PlatformIncident::query()->where('status', 'open')->when($pressingIds !== null, fn ($q) => $q->whereIn('pressing_id', $pressingIds));
        $activeIds = $scope()->where('status', 'active')->pluck('id');

        return response()->json([
            'tenants_active' => $activeIds->count(),
            'tenants_new_this_quarter' => $scope()->where('created_at', '>=', now()->firstOfQuarter())->count(),
            'agencies' => \App\Models\Agency::query()->whereIn('pressing_id', $activeIds)->where('is_active', true)->count(),
            'countries' => $scope()->where('status', 'active')->whereNotNull('country_code')->distinct()->count('country_code'),
            'licenses' => $scope()->whereNotNull('license_expires_at')->count(),
            'licenses_renewal_due' => $scope()->whereNotNull('license_expires_at')->where('license_expires_at', '>', now())->where('license_expires_at', '<=', now()->addDays(30))->count(),
            'incidents_open' => $incidents()->count(),
            'incidents_high' => $incidents()->whereIn('priority', ['P1', 'P2'])->count(),
            'tabs' => [
                'all' => $scope()->count(),
                'active' => $scope()->where('status', 'active')->count(),
                'renewal_due' => $scope()->whereNotNull('license_expires_at')->where('license_expires_at', '>', now())->where('license_expires_at', '<=', now()->addDays(30))->count(),
                'suspended' => $scope()->where('status', 'suspended')->count(),
                'incident' => $scope()->whereHas('incidents', fn ($q) => $q->where('status', 'open'))->count(),
            ],
        ]);
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
