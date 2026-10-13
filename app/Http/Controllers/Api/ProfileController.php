<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Profile\ChangePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Models\AppSetting;
use App\Models\AuthEvent;
use App\Models\AuthorizedDevice;
use App\Models\User;
use App\Services\QrCodeGenerator;
use App\Services\TotpService;
use App\Support\UserAgent;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ProfileController extends ApiController
{
    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->safe()->only(['name', 'phone', 'first_name', 'last_name', 'job_title', 'timezone']);
        if ($request->has('preferences')) {
            $data['preferences'] = array_merge($user->preferences ?? [], $request->validated('preferences') ?? []);
        }
        // Prénom + nom renseignés : le nom d'affichage historique (`name`) en découle.
        $first = $data['first_name'] ?? $user->first_name;
        $last = $data['last_name'] ?? $user->last_name;
        if (($request->filled('first_name') || $request->filled('last_name')) && trim("{$first} {$last}") !== '') {
            $data['name'] = trim("{$first} {$last}");
        }

        if ($request->hasFile('photo')) {
            $disk = Storage::disk(config('filesystems.default'));
            if ($user->photo_path !== null) {
                $disk->delete($user->photo_path);
            }
            $data['photo_path'] = $request->file('photo')->store("users/{$user->id}", ['disk' => config('filesystems.default')]);
        }

        $user->update($data);

        return response()->json($user->fresh()->load('role.permissions', 'agency', 'extraAgencies:id,name'));
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update([
            'password' => Hash::make($request->validated('new_password')),
            'must_change_password' => false,
            'password_changed_at' => now(),
        ]);
        AuthEvent::record('password_changed', $user, $request);

        return response()->json($user->fresh()->load('role.permissions', 'agency', 'extraAgencies:id,name'));
    }

    public function photo(Request $request, User $user): StreamedResponse
    {
        if ($request->user()->id !== $user->id && ! $request->user()->hasPermission('users.manage')) {
            throw new HttpException(403, "Vous n'avez pas accès à cette photo.");
        }

        $disk = Storage::disk(config('filesystems.default'));
        if ($user->photo_path === null || ! $disk->exists($user->photo_path)) {
            throw new HttpException(404, 'Photo introuvable.');
        }

        return $disk->response($user->photo_path);
    }

    /**
     * Synthèse sécurité du compte courant : dernière connexion (avant la session en
     * cours), sessions actives (jetons Sanctum non expirés), appareils de confiance,
     * état MFA, date du dernier changement de mot de passe.
     */
    public function security(Request $request): JsonResponse
    {
        $user = $request->user();
        $currentId = $user->currentAccessToken()?->id;

        $logins = AuthEvent::where('user_id', $user->id)->where('type', 'login')->latest('created_at')->limit(2)->get();
        $previous = $logins->first(fn (AuthEvent $e) => ($e->meta['token_id'] ?? null) !== $currentId) ?? $logins->first();

        $sessions = $user->tokens()
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->latest('last_used_at')
            ->get()
            ->map(fn ($token) => [
                'id' => $token->id,
                'name' => $token->name,
                'device' => UserAgent::describe($token->user_agent ?? $token->name) ?? $token->name,
                'kind' => UserAgent::kind($token->user_agent ?? $token->name),
                'ip_address' => $token->ip_address,
                'last_used_at' => $token->last_used_at,
                'created_at' => $token->created_at,
                'current' => $token->id === $currentId,
            ]);

        return response()->json([
            'last_login' => $previous ? [
                'at' => $previous->created_at,
                'ip_address' => $previous->ip_address,
                'device' => UserAgent::describe($previous->user_agent),
            ] : null,
            'password_changed_at' => $user->password_changed_at,
            'mfa' => [
                'enabled' => $user->mfa_enabled,
                'enabled_at' => $user->mfa_enabled_at,
                'required' => $user->mfa_required,
                'recovery_codes_remaining' => $user->mfa_enabled ? $user->remainingRecoveryCodes() : 0,
            ],
            'sessions' => $sessions,
            'devices' => $user->authorizedDevices()->whereNull('revoked_at')->where('authorized_until', '>', now())->latest()->get()
                ->map(fn (AuthorizedDevice $d) => [
                    'id' => $d->id,
                    'label' => $d->label,
                    'kind' => UserAgent::kind($d->user_agent),
                    'authorized_until' => $d->authorized_until,
                    'last_used_at' => $d->last_used_at,
                ]),
        ]);
    }

    public function revokeSession(Request $request, int $tokenId): JsonResponse
    {
        $user = $request->user();
        if ($tokenId === $user->currentAccessToken()?->id) {
            throw new HttpException(422, 'Utilisez « Déconnexion » pour fermer la session en cours.');
        }
        $deleted = $user->tokens()->where('id', $tokenId)->delete();
        if ($deleted === 0) {
            throw new HttpException(404, 'Session introuvable.');
        }
        AuthEvent::record('session_revoked', $user, $request, ['token_id' => $tokenId]);

        return response()->json(['message' => 'Session déconnectée.']);
    }

    public function revokeOtherSessions(Request $request): JsonResponse
    {
        $user = $request->user();
        $count = $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();
        AuthEvent::record('sessions_revoked', $user, $request, ['count' => $count]);

        return response()->json(['revoked' => $count]);
    }

    public function revokeDevice(Request $request, AuthorizedDevice $device): JsonResponse
    {
        if ($device->user_id !== $request->user()->id) {
            throw new HttpException(404, 'Appareil introuvable.');
        }
        $device->forceFill(['revoked_at' => now()])->save();
        AuthEvent::record('device_revoked', $request->user(), $request, ['device_id' => $device->id, 'label' => $device->label]);

        return response()->json(['message' => 'Appareil retiré.']);
    }

    /** Étape 1 de l'enrôlement MFA : secret provisoire (cache) + QR à scanner. */
    public function mfaSetup(Request $request, TotpService $totp, QrCodeGenerator $qr): JsonResponse
    {
        $user = $request->user();
        $secret = $totp->generateSecret();
        Cache::put("tenant.mfa.setup.{$user->id}", $secret, now()->addMinutes(15));
        $uri = $totp->provisioningUri($secret, $user->email, AppSetting::nameFor($user->pressing_id));

        return response()->json(['secret' => $secret, 'otpauth_uri' => $uri, 'qr_code_data_uri' => $qr->toPngDataUri($uri)]);
    }

    /** Étape 2 : un code valide confirme l'enrôlement et renvoie 8 codes de secours (une seule fois). */
    public function mfaConfirm(Request $request, TotpService $totp): JsonResponse
    {
        $user = $request->user();
        $request->validate(['code' => ['required', 'string', 'max:10']]);
        $secret = Cache::get("tenant.mfa.setup.{$user->id}");
        if ($secret === null || ! $totp->verify($secret, str_replace(' ', '', $request->string('code')->value()))) {
            throw ValidationException::withMessages(['code' => ['Code invalide ou expiré.']]);
        }

        Cache::forget("tenant.mfa.setup.{$user->id}");
        $user->forceFill(['mfa_secret' => $secret, 'mfa_enabled_at' => now()])->save();
        $codes = $user->regenerateRecoveryCodes();
        AuthEvent::record('mfa_enabled', $user, $request);

        return response()->json(['recovery_codes' => $codes]);
    }

    public function mfaDisable(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate(['password' => ['required', 'current_password:web']]);
        if ($user->mfa_required) {
            throw new HttpException(422, "L'authentification renforcée est exigée pour ce compte par l'administrateur.");
        }

        $user->forceFill(['mfa_secret' => null, 'mfa_enabled_at' => null, 'mfa_recovery_codes' => null])->save();
        $user->authorizedDevices()->whereNull('revoked_at')->update(['revoked_at' => now()]);
        AuthEvent::record('mfa_disabled', $user, $request);

        return response()->json(['message' => 'Authentification renforcée désactivée.']);
    }
}
