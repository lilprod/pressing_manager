<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Controllers\Controller;
use App\Models\PlatformUser;
use App\Models\PlatformUserRecoveryCode;
use App\Services\TotpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Connexion en 2 étapes pour la console superadmin : mot de passe, puis code TOTP
 * (MFA obligatoire, cf. maquette). Un "challenge" opaque (5 min, cache) relie les deux
 * étapes sans exposer l'identité de l'utilisateur dans la requête de vérification.
 */
class PlatformAuthController extends Controller
{
    private const CHALLENGE_TTL_MINUTES = 5;

    public function __construct(private readonly TotpService $totp) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = PlatformUser::where('email', $data['email'])->where('is_active', true)->first();

        if ($user !== null && $user->isLocked()) {
            throw new HttpException(423, 'Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.');
        }

        if ($user === null || ! Hash::check($data['password'], $user->password)) {
            $user?->registerFailedLogin();

            throw ValidationException::withMessages(['email' => ['Identifiants invalides.']]);
        }

        $challenge = Str::random(48);
        Cache::put("platform.login.challenge.{$challenge}", $user->id, now()->addMinutes(self::CHALLENGE_TTL_MINUTES));

        if (! $user->hasMfaEnabled()) {
            $secret = $this->totp->generateSecret();
            $user->forceFill(['totp_secret' => $secret])->save();

            return response()->json([
                'mfa_setup_required' => true,
                'challenge' => $challenge,
                'otpauth_uri' => $this->totp->provisioningUri($secret, $user->email),
            ]);
        }

        return response()->json(['mfa_required' => true, 'challenge' => $challenge]);
    }

    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge' => ['required', 'string'],
            'code' => ['required', 'string'],
        ]);

        $user = $this->resolveChallenge($data['challenge']);

        if (! $user->hasMfaEnabled()) {
            throw new HttpException(422, "La double authentification n'est pas encore configurée pour ce compte.");
        }

        if (! $this->totp->verify($user->totp_secret, $data['code']) && ! $this->consumeRecoveryCode($user, $data['code'])) {
            throw ValidationException::withMessages(['code' => ['Code invalide.']]);
        }

        return $this->completeLogin($user, $data['challenge']);
    }

    public function confirmSetup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge' => ['required', 'string'],
            'code' => ['required', 'string'],
        ]);

        $user = $this->resolveChallenge($data['challenge']);

        if ($user->hasMfaEnabled()) {
            throw new HttpException(422, 'La double authentification est déjà configurée pour ce compte.');
        }

        if (! $this->totp->verify($user->totp_secret, $data['code'])) {
            throw ValidationException::withMessages(['code' => ['Code invalide.']]);
        }

        $user->forceFill(['totp_enabled_at' => now()])->save();
        $recoveryCodes = $this->generateRecoveryCodes($user);

        $response = $this->completeLogin($user, $data['challenge']);

        return response()->json($response->getData(true) + ['recovery_codes' => $recoveryCodes]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Déconnecté.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    private function resolveChallenge(string $challenge): PlatformUser
    {
        $userId = Cache::get("platform.login.challenge.{$challenge}");

        if ($userId === null) {
            throw new HttpException(422, 'Session de connexion expirée, reconnectez-vous.');
        }

        return PlatformUser::findOrFail($userId);
    }

    private function completeLogin(PlatformUser $user, string $challenge): JsonResponse
    {
        Cache::forget("platform.login.challenge.{$challenge}");
        $user->registerSuccessfulLogin();
        $token = $user->createToken('platform-console');

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $user,
        ]);
    }

    private function consumeRecoveryCode(PlatformUser $user, string $code): bool
    {
        $hash = hash('sha256', $code);
        $match = $user->recoveryCodes()->whereNull('used_at')->where('code_hash', $hash)->first();

        if ($match === null) {
            return false;
        }

        $match->forceFill(['used_at' => now()])->save();

        return true;
    }

    /** @return list<string> codes en clair, affichés une seule fois à l'appelant */
    private function generateRecoveryCodes(PlatformUser $user): array
    {
        $user->recoveryCodes()->delete();

        $plainCodes = [];
        foreach (range(1, 8) as $i) {
            $plain = Str::upper(Str::random(10));
            $plainCodes[] = $plain;

            PlatformUserRecoveryCode::create([
                'platform_user_id' => $user->id,
                'code_hash' => hash('sha256', $plain),
            ]);
        }

        return $plainCodes;
    }
}
