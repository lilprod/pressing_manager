<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\UpdatePlatformSettingRequest;
use App\Models\PlatformSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Identité de la console superadmin elle-même (Phase 1) — réservé au rôle superadmin
 * (voir `UpdatePlatformSettingRequest::authorize()`), pas `admin_transverse` : c'est
 * l'identité de toute la console, pas un périmètre opérationnel par pressing.
 */
class PlatformSettingController extends PlatformApiController
{
    public function show(): JsonResponse
    {
        return response()->json($this->present(PlatformSetting::current()));
    }

    public function update(UpdatePlatformSettingRequest $request): JsonResponse
    {
        $settings = PlatformSetting::current();
        $data = $request->safe()->except(['logo', 'favicon']);

        $disk = Storage::disk(config('filesystems.default'));

        if ($request->hasFile('logo')) {
            if ($settings->logo_path !== null) {
                $disk->delete($settings->logo_path);
            }
            $data['logo_path'] = $request->file('logo')->store('platform-settings', ['disk' => config('filesystems.default')]);
        }

        if ($request->hasFile('favicon')) {
            if ($settings->favicon_path !== null) {
                $disk->delete($settings->favicon_path);
            }
            $data['favicon_path'] = $request->file('favicon')->store('platform-settings', ['disk' => config('filesystems.default')]);
        }

        $settings->update($data);

        return response()->json($this->present($settings->fresh()));
    }

    public function logo(): StreamedResponse
    {
        return $this->streamAsset(PlatformSetting::current()->logo_path);
    }

    public function favicon(): StreamedResponse
    {
        return $this->streamAsset(PlatformSetting::current()->favicon_path);
    }

    private function present(PlatformSetting $settings): array
    {
        return [
            ...$settings->toArray(),
            'logo_url' => $settings->logo_path !== null ? url('/api/platform/settings/logo') : null,
            'favicon_url' => $settings->favicon_path !== null ? url('/api/platform/settings/favicon') : null,
        ];
    }

    private function streamAsset(?string $path): StreamedResponse
    {
        $disk = Storage::disk(config('filesystems.default'));

        if ($path === null || ! $disk->exists($path)) {
            abort(404);
        }

        return $disk->response($path);
    }
}
