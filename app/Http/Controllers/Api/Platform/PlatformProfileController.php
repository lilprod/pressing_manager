<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\ChangePlatformPasswordRequest;
use App\Http\Requests\Platform\UpdatePlatformProfileRequest;
use App\Models\PlatformSetting;
use App\Models\PlatformUser;
use App\Services\QrCodeGenerator;
use App\Services\TotpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Mirrors App\Http\Controllers\Api\ProfileController (tenant) pour le royaume plateforme. */
class PlatformProfileController extends PlatformApiController
{
    public function update(UpdatePlatformProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->safe()->only(['name', 'phone']);

        if ($request->hasFile('photo')) {
            $disk = Storage::disk(config('filesystems.default'));
            if ($user->photo_path !== null) {
                $disk->delete($user->photo_path);
            }
            $data['photo_path'] = $request->file('photo')->store("platform_users/{$user->id}", ['disk' => config('filesystems.default')]);
        }

        $user->update($data);

        return response()->json($user->fresh(['platformRole', 'pressings']));
    }

    public function changePassword(ChangePlatformPasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update([
            'password' => Hash::make($request->validated('new_password')),
            'must_change_password' => false,
        ]);

        return response()->json($user->fresh(['platformRole', 'pressings']));
    }

    /** Étape 1 de l'activation : nouveau secret TOTP (non actif tant que `mfaEnable` n'a pas validé un code). */
    public function mfaSetup(Request $request, TotpService $totp, QrCodeGenerator $qrCode): JsonResponse
    {
        $user = $request->user();

        if ($user->hasMfaEnabled()) {
            throw new HttpException(422, 'La double authentification est déjà activée.');
        }

        $secret = $totp->generateSecret();
        $user->forceFill(['totp_secret' => $secret])->save();
        $otpauthUri = $totp->provisioningUri($secret, $user->email, PlatformSetting::current()->app_name);

        return response()->json([
            'otpauth_uri' => $otpauthUri,
            'qr_code_data_uri' => $qrCode->toPngDataUri($otpauthUri),
        ]);
    }

    /** Étape 2 de l'activation : le premier code valide active le MFA et renvoie les codes de secours (affichés une fois). */
    public function mfaEnable(Request $request, TotpService $totp): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string']]);
        $user = $request->user();

        if ($user->hasMfaEnabled()) {
            throw new HttpException(422, 'La double authentification est déjà activée.');
        }

        if ($user->totp_secret === null) {
            throw new HttpException(422, "Lancez d'abord la configuration de la double authentification.");
        }

        if (! $totp->verify($user->totp_secret, $data['code'])) {
            throw ValidationException::withMessages(['code' => ['Code invalide.']]);
        }

        $user->forceFill(['totp_enabled_at' => now()])->save();

        return response()->json([
            'recovery_codes' => $user->regenerateRecoveryCodes(),
            'user' => $user->fresh(['platformRole', 'pressings']),
        ]);
    }

    /** Désactivation : mot de passe actuel + code TOTP (ou code de secours) requis. */
    public function mfaDisable(Request $request, TotpService $totp): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string'],
            'code' => ['required', 'string'],
        ]);
        $user = $request->user();

        if (! $user->hasMfaEnabled()) {
            throw new HttpException(422, "La double authentification n'est pas activée.");
        }

        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ['Mot de passe incorrect.']]);
        }

        if (! $totp->verify($user->totp_secret, $data['code']) && ! $user->consumeRecoveryCode($data['code'])) {
            throw ValidationException::withMessages(['code' => ['Code invalide.']]);
        }

        $user->forceFill(['totp_secret' => null, 'totp_enabled_at' => null])->save();
        $user->recoveryCodes()->delete();

        return response()->json($user->fresh(['platformRole', 'pressings']));
    }

    public function photo(Request $request, PlatformUser $platformUser): StreamedResponse
    {
        if ($request->user()->id !== $platformUser->id && ! $request->user()->hasPermission('platform_users.manage')) {
            throw new HttpException(403, "Vous n'avez pas accès à cette photo.");
        }

        $disk = Storage::disk(config('filesystems.default'));
        if ($platformUser->photo_path === null || ! $disk->exists($platformUser->photo_path)) {
            throw new HttpException(404, 'Photo introuvable.');
        }

        return $disk->response($platformUser->photo_path);
    }
}
