<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Settings\UpdateAppSettingsRequest;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class SettingsController extends ApiController
{
    /**
     * Identité globale du pressing (nom, adresse, logo, favicon). Public : utilisée
     * pour la marque de l'application avant même la connexion (écran de connexion,
     * titre de l'onglet, favicon).
     */
    public function show(): JsonResponse
    {
        return response()->json($this->present(AppSetting::current()));
    }

    public function update(UpdateAppSettingsRequest $request): JsonResponse
    {
        $settings = AppSetting::current();
        $disk = Storage::disk(config('filesystems.default'));

        $data = $request->safe()->only([
            'pressing_name', 'address', 'phone', 'email', 'tax_id',
            'password_expiry_days', 'session_timeout_minutes',
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
        return $this->streamAsset(AppSetting::current()->logo_path);
    }

    public function favicon(): StreamedResponse
    {
        return $this->streamAsset(AppSetting::current()->favicon_path);
    }

    private function streamAsset(?string $path): StreamedResponse
    {
        $disk = Storage::disk(config('filesystems.default'));
        if ($path === null || ! $disk->exists($path)) {
            throw new HttpException(404, 'Fichier introuvable.');
        }

        return $disk->response($path);
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
            'session_timeout_minutes' => $settings->session_timeout_minutes,
            'password_min_length' => $settings->password_min_length,
            'password_require_uppercase' => $settings->password_require_uppercase,
            'password_require_number' => $settings->password_require_number,
            'password_require_symbol' => $settings->password_require_symbol,
        ];
    }
}
