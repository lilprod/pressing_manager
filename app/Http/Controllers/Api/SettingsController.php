<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Settings\UpdateAppSettingsRequest;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class SettingsController extends ApiController
{
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
            'logo_url' => null,
            'favicon_url' => null,
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
            'logo_url' => $settings->logo_path !== null ? url('/api/settings/logo') : null,
            'favicon_url' => $settings->favicon_path !== null ? url('/api/settings/favicon') : null,
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
