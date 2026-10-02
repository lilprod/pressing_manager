<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Settings\SaveBrandingDraftRequest;
use App\Http\Requests\Settings\UpdateAppSettingsRequest;
use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\AppSetting;
use App\Models\AppSettingVersion;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class SettingsController extends ApiController
{
    /** Champs couverts par le brouillon/publication (CLAUDE.md « Branding — brouillon / publication »). */
    private const BRANDING_DRAFT_FIELDS = [
        'pressing_name', 'address', 'phone', 'email', 'tax_id', 'website', 'legal_notice',
        'primary_color', 'secondary_color', 'monogram', 'ticket_footer', 'ticket_conditions',
    ];

    /**
     * Identité du pressing courant (nom, adresse, logo, favicon). Route publique
     * (pas de middleware `auth:sanctum`) : utilisée avant même la connexion (écran
     * de connexion, titre de l'onglet, favicon) — voir `routes/web.php`. Depuis le
     * pivot multi-tenant (CLAUDE.md), l'identité dépend du pressing de l'utilisateur
     * connecté ; résolue manuellement via le guard pour rester accessible sans
     * middleware, repli générique si aucun jeton n'est présent (visiteur anonyme,
     * écran de connexion — il n'y a alors aucun moyen de savoir de quel pressing il
     * s'agit, l'app n'utilise pas de sous-domaine par pressing).
     */
    public function show(): JsonResponse
    {
        $pressingId = Auth::guard('sanctum')->user()?->pressing_id;

        return response()->json($pressingId !== null ? $this->present(AppSetting::current($pressingId)) : $this->presentDefault());
    }

    public function update(UpdateAppSettingsRequest $request): JsonResponse
    {
        $settings = AppSetting::current($request->user()->pressing_id);
        $disk = Storage::disk(config('filesystems.default'));

        $data = $request->safe()->only([
            'pressing_name', 'address', 'phone', 'email', 'tax_id',
            'password_expiry_days', 'password_expiry_warning_days', 'session_timeout_minutes',
            'password_min_length', 'password_require_uppercase', 'password_require_number', 'password_require_symbol',
        ]);

        if ($request->hasFile('logo')) {
            if ($settings->logo_path !== null) {
                $disk->delete($settings->logo_path);
            }
            $data['logo_path'] = $request->file('logo')->store('settings', ['disk' => config('filesystems.default')]);
        }

        if ($request->hasFile('favicon')) {
            if ($settings->favicon_path !== null) {
                $disk->delete($settings->favicon_path);
            }
            $data['favicon_path'] = $request->file('favicon')->store('settings', ['disk' => config('filesystems.default')]);
        }

        $settings->update($data);

        return response()->json($this->present($settings));
    }

    /**
     * Panneau « Dernières modifications » du hub Paramètres (node 25:12184) :
     * dernières entrées d'audit vraiment liées aux réglages (agences, identité du
     * pressing, réglages opérationnels par agence — ajoutés au fil des chantiers),
     * pas via `AuditLogController::index()` dont le filtre `whereIn('agency_id',
     * $agencyIds)` exclurait silencieusement les lignes `AppSetting` (agency_id
     * toujours null, scoping par pressing_id).
     */
    public function recentChanges(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');
        $pressingId = $request->user()->pressing_id;
        $agencyIds = Agency::where('pressing_id', $pressingId)->pluck('id');
        $appSettingIds = AppSetting::where('pressing_id', $pressingId)->pluck('id');
        $agencySettingIds = AgencySetting::whereIn('agency_id', $agencyIds)->pluck('id');

        $logs = AuditLog::query()
            ->with('user')
            ->where(function ($query) use ($agencyIds, $appSettingIds, $agencySettingIds) {
                // auditable_type obligatoire sur chaque branche : sans lui,
                // whereIn('agency_id', $agencyIds) remonterait N'IMPORTE QUEL modèle audité
                // rattaché à ces agences (Order, Payment, Shift...), pas seulement les
                // changements de réglages eux-mêmes — bug repéré à la capture Playwright,
                // pas par un test (aucun test n'avait d'autre type audité partageant l'agence).
                $query->where(fn ($q) => $q->where('auditable_type', Agency::class)->whereIn('auditable_id', $agencyIds))
                    ->orWhere(fn ($q) => $q->where('auditable_type', AppSetting::class)->whereIn('auditable_id', $appSettingIds))
                    ->orWhere(fn ($q) => $q->where('auditable_type', AgencySetting::class)->whereIn('auditable_id', $agencySettingIds));
            })
            ->latest('created_at')
            ->limit(5)
            ->get();

        return response()->json($logs->map(fn (AuditLog $log) => [
            'id' => $log->id,
            'action' => $log->action,
            'auditable_type' => class_basename($log->auditable_type),
            'auditable_id' => $log->auditable_id,
            'old_values' => $log->old_values,
            'new_values' => $log->new_values,
            'user' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
            'created_at' => $log->created_at,
        ]));
    }

    /**
     * Sauvegarde un brouillon de branding — ne touche jamais les colonnes live,
     * fusionné (pas remplacé) dans `draft_data` : un champ absent de la requête
     * garde sa valeur de brouillon précédente. Logo/favicon restent hors brouillon
     * (voir SaveBrandingDraftRequest).
     */
    public function saveDraft(SaveBrandingDraftRequest $request): JsonResponse
    {
        $settings = AppSetting::current($request->user()->pressing_id);
        $validated = $request->validated();

        $incoming = collect(self::BRANDING_DRAFT_FIELDS)
            ->filter(fn ($field) => $request->has($field))
            ->mapWithKeys(fn ($field) => [$field => $validated[$field] ?? null])
            ->all();

        $settings->update([
            'draft_data' => array_merge($settings->draft_data ?? [], $incoming),
            'draft_saved_at' => now(),
        ]);

        return response()->json($this->present($settings->refresh()));
    }

    /** Bouton « Restaurer par défaut » : abandonne le brouillon, revient aux valeurs publiées. */
    public function discardDraft(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');
        $settings = AppSetting::current($request->user()->pressing_id);
        $settings->update(['draft_data' => null, 'draft_saved_at' => null]);

        return response()->json($this->present($settings->refresh()));
    }

    /**
     * Applique le brouillon aux colonnes live et journalise une version restaurable
     * (append-only). `affected_agencies_count` : les 4 canaux de la maquette (nav,
     * tickets/factures, e-mails/SMS, domaine) lisent tous la même ligne app_settings,
     * donc ce compte reflète honnêtement l'impact réel — pas une vérification
     * canal par canal, qui n'existe pas.
     */
    public function publish(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');
        $settings = AppSetting::current($request->user()->pressing_id);
        $draft = $settings->draft_data ?? [];

        if ($draft !== []) {
            $settings->update($draft);
        }
        $settings->refresh();

        $snapshot = collect(self::BRANDING_DRAFT_FIELDS)->mapWithKeys(fn ($field) => [$field => $settings->$field])->all();
        $version = AppSettingVersion::create([
            'app_setting_id' => $settings->id,
            'pressing_id' => $settings->pressing_id,
            'data' => $snapshot,
            'published_by' => $request->user()->id,
        ]);

        $settings->update(['draft_data' => null, 'draft_saved_at' => null]);

        $affectedAgencies = Agency::where('pressing_id', $settings->pressing_id)->count();

        return response()->json($this->present($settings->refresh()) + [
            'affected_agencies_count' => $affectedAgencies,
            'version_id' => $version->id,
        ]);
    }

    /** Historique des publications (10 dernières) — écran Branding. */
    public function versions(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');
        $settings = AppSetting::current($request->user()->pressing_id);
        $versions = $settings->versions()->with('publisher')->limit(10)->get();

        return response()->json($versions->map(fn (AppSettingVersion $v) => [
            'id' => $v->id,
            'data' => $v->data,
            'published_by' => $v->publisher ? ['id' => $v->publisher->id, 'name' => $v->publisher->name] : null,
            'restored_from_version_id' => $v->restored_from_version_id,
            'created_at' => $v->created_at?->toIso8601String(),
        ]));
    }

    /**
     * Restaure une ancienne version : applique son instantané aux colonnes live et
     * journalise une NOUVELLE version chaînée (jamais de réécriture d'historique,
     * même convention que AuditLog/append-only). Abandonne aussi un brouillon en
     * attente, pour éviter une interaction confuse entre restauration et brouillon.
     */
    public function restoreVersion(Request $request, AppSettingVersion $version): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');
        if ($version->pressing_id !== $request->user()->pressing_id) {
            throw new HttpException(403, "Cette version n'appartient pas à votre pressing.");
        }

        $settings = AppSetting::current($request->user()->pressing_id);
        $settings->update(array_merge($version->data, ['draft_data' => null, 'draft_saved_at' => null]));

        $newVersion = AppSettingVersion::create([
            'app_setting_id' => $settings->id,
            'pressing_id' => $settings->pressing_id,
            'data' => $version->data,
            'restored_from_version_id' => $version->id,
            'published_by' => $request->user()->id,
        ]);

        return response()->json($this->present($settings->refresh()) + ['version_id' => $newVersion->id]);
    }

    public function logo(): StreamedResponse
    {
        $pressingId = Auth::guard('sanctum')->user()?->pressing_id;

        return $this->streamAsset($pressingId !== null ? AppSetting::current($pressingId)->logo_path : null);
    }

    public function favicon(): StreamedResponse
    {
        $pressingId = Auth::guard('sanctum')->user()?->pressing_id;

        return $this->streamAsset($pressingId !== null ? AppSetting::current($pressingId)->favicon_path : null);
    }

    private function streamAsset(?string $path): StreamedResponse
    {
        $disk = Storage::disk(config('filesystems.default'));
        if ($path === null || ! $disk->exists($path)) {
            throw new HttpException(404, 'Fichier introuvable.');
        }

        return $disk->response($path);
    }

    /**
     * Visiteur anonyme (pas de jeton, ex. écran de connexion) : impossible de savoir
     * de quel pressing il s'agit (pas de sous-domaine par pressing dans cette app).
     * Reprend volontairement les mêmes défauts que les colonnes `app_settings`
     * (voir migrations) — c'est exactement ce qu'afficherait un pressing flambant
     * neuf, donc pas une donnée inventée, juste pas celle d'un pressing arbitraire.
     */
    private function presentDefault(): array
    {
        return [
            'pressing_name' => 'Pressing Manager',
            'address' => null,
            'phone' => null,
            'email' => null,
            'tax_id' => null,
            'website' => null,
            'legal_notice' => null,
            'logo_url' => null,
            'favicon_url' => null,
            'primary_color' => null,
            'secondary_color' => null,
            'monogram' => null,
            'ticket_footer' => null,
            'ticket_conditions' => null,
            'draft_data' => null,
            'draft_saved_at' => null,
            'password_expiry_days' => null,
            'password_expiry_warning_days' => 14,
            'session_timeout_minutes' => 30,
            'password_min_length' => 8,
            'password_require_uppercase' => true,
            'password_require_number' => true,
            'password_require_symbol' => false,
            'tax_rate' => (float) config('invoicing.tax_rate'),
            'loyalty_amount_per_point' => max(1, (int) config('loyalty.amount_per_point')),
            'updated_at' => null,
        ];
    }

    private function present(AppSetting $settings): array
    {
        return [
            'pressing_name' => $settings->pressing_name,
            'address' => $settings->address,
            'phone' => $settings->phone,
            'email' => $settings->email,
            'tax_id' => $settings->tax_id,
            'website' => $settings->website,
            'legal_notice' => $settings->legal_notice,
            'logo_url' => $settings->logo_path !== null ? url('/api/settings/logo') : null,
            'favicon_url' => $settings->favicon_path !== null ? url('/api/settings/favicon') : null,
            'primary_color' => $settings->primary_color,
            'secondary_color' => $settings->secondary_color,
            'monogram' => $settings->monogram,
            'ticket_footer' => $settings->ticket_footer,
            'ticket_conditions' => $settings->ticket_conditions,
            'draft_data' => $settings->draft_data,
            'draft_saved_at' => $settings->draft_saved_at?->toIso8601String(),
            'password_expiry_days' => $settings->password_expiry_days,
            'password_expiry_warning_days' => $settings->password_expiry_warning_days,
            'session_timeout_minutes' => $settings->session_timeout_minutes,
            'password_min_length' => $settings->password_min_length,
            'password_require_uppercase' => $settings->password_require_uppercase,
            'password_require_number' => $settings->password_require_number,
            'password_require_symbol' => $settings->password_require_symbol,
            'tax_rate' => (float) config('invoicing.tax_rate'),
            // Règle d'acquisition des points (config/loyalty.php) : affichée sur l'écran Fidélité
            // au lieu d'une valeur codée en dur côté front.
            'loyalty_amount_per_point' => max(1, (int) config('loyalty.amount_per_point')),
            // Horodatage de la ligne (colonne timestamps déjà en base) : affiché sur le hub des paramètres.
            'updated_at' => $settings->updated_at?->toIso8601String(),
        ];
    }
}
