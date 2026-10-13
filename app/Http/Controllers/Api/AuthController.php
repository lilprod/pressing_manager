<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\Agency;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use App\Services\TotpService;
use App\Support\UserAgent;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AuthController extends Controller
{
    #[OA\Post(
        path: '/login',
        summary: "Authentifie un utilisateur et retourne un jeton d'API Sanctum",
        tags: ['Auth'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['email', 'password', 'device_name'],
            properties: [
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'password', type: 'string', format: 'password'),
                new OA\Property(property: 'device_name', type: 'string', example: 'web-accueil'),
            ]
        )),
        responses: [
            new OA\Response(response: 200, description: 'Connexion réussie, jeton renvoyé'),
            new OA\Response(response: 422, description: 'Identifiants invalides'),
        ]
    )]
    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::where('email', $data['email'])->where('is_active', true)->first();

        if ($user !== null && $user->isLocked()) {
            AuthEvent::record('login_locked', $user, $request);
            throw new HttpException(423, 'Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.');
        }

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            if ($user !== null) {
                $user->registerFailedLogin();
                AuthEvent::record($user->isLocked() ? 'login_locked' : 'login_failed', $user, $request);
            }

            throw ValidationException::withMessages([
                'email' => ["Identifiants invalides."],
            ]);
        }

        if (! empty($data['agency_id']) && ! $user->canAccessAgency((int) $data['agency_id'])) {
            throw ValidationException::withMessages([
                'agency_id' => ["Agence invalide pour ce compte."],
            ]);
        }

        // Second facteur (TOTP) : exigé si le compte l'a activé, sauf depuis un appareil
        // de confiance encore valide (« Appareils autorisés » du profil).
        if ($user->mfa_enabled && ! $this->trustedDevice($user, $request->input('device_token'))) {
            $challenge = Str::random(48);
            Cache::put("tenant.login.challenge.{$challenge}", [
                'user_id' => $user->id,
                'device_name' => $data['device_name'],
                'agency_id' => $data['agency_id'] ?? null,
                'remember' => $request->boolean('remember'),
            ], now()->addMinutes(10));

            return response()->json(['mfa_required' => true, 'challenge' => $challenge]);
        }

        return $this->issueToken($user, $request, $data['device_name'], $data['agency_id'] ?? null, $request->boolean('remember'));
    }

    /** Deuxième étape de connexion : code TOTP ou code de secours à usage unique. */
    public function verifyMfa(Request $request, TotpService $totp): JsonResponse
    {
        $data = $request->validate([
            'challenge' => ['required', 'string'],
            'code' => ['required', 'string', 'max:20'],
            'trust_device' => ['sometimes', 'boolean'],
            'device_label' => ['nullable', 'string', 'max:120'],
        ]);

        $pending = Cache::get("tenant.login.challenge.{$data['challenge']}");
        if ($pending === null) {
            throw new HttpException(422, 'Session de connexion expirée, reconnectez-vous.');
        }

        $user = User::where('id', $pending['user_id'])->where('is_active', true)->firstOrFail();
        $code = str_replace(' ', '', $data['code']);
        $valid = ($user->mfa_secret && $totp->verify($user->mfa_secret, $code)) || $user->consumeRecoveryCode($code);

        if (! $valid) {
            $user->registerFailedLogin();
            AuthEvent::record('mfa_failed', $user, $request);
            if ($user->isLocked()) {
                Cache::forget("tenant.login.challenge.{$data['challenge']}");
                throw new HttpException(423, 'Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.');
            }
            throw ValidationException::withMessages(['code' => ['Code invalide.']]);
        }

        Cache::forget("tenant.login.challenge.{$data['challenge']}");
        $response = $this->issueToken($user, $request, $pending['device_name'], $pending['agency_id'], $pending['remember']);

        if ($request->boolean('trust_device')) {
            $plain = Str::random(64);
            $device = $user->authorizedDevices()->create([
                'label' => ($data['device_label'] ?? null) ?: (UserAgent::describe($request->userAgent()) ?? 'Appareil'),
                'token_hash' => hash('sha256', $plain),
                'user_agent' => substr((string) $request->userAgent(), 0, 500),
                'ip_address' => $request->ip(),
                'authorized_until' => now()->addDays(30),
            ]);
            AuthEvent::record('device_authorized', $user, $request, ['device_id' => $device->id, 'label' => $device->label]);

            return response()->json($response->getData(true) + ['device_token' => $plain]);
        }

        return $response;
    }

    private function trustedDevice(User $user, mixed $token): bool
    {
        if (! is_string($token) || $token === '') {
            return false;
        }

        $device = $user->authorizedDevices()->where('token_hash', hash('sha256', $token))->first();
        if ($device === null || ! $device->isValid()) {
            return false;
        }

        $device->forceFill(['last_used_at' => now()])->save();

        return true;
    }

    private function issueToken(User $user, Request $request, string $deviceName, mixed $agencyId, bool $remember): JsonResponse
    {
        $user->registerSuccessfulLogin();
        $user->forceFill(['last_login_at' => now(), 'invitation_expires_at' => null])->save();

        // Nouveaux jetons désormais bornés dans le temps (voir CLAUDE.md « Se souvenir
        // de moi ») : 30 jours si "remember" est coché, 12h sinon — jamais plus éternel
        // pour un nouveau login. Les jetons déjà émis avant ce changement restent
        // éternels (pas de migration de données, comportement forward-only).
        $expiresAt = $remember ? now()->addDays(30) : now()->addHours(12);
        $token = $user->createToken($deviceName, ['*'], $expiresAt);
        $token->accessToken->forceFill([
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 500),
        ])->save();
        AuthEvent::record('login', $user, $request, ['token_id' => $token->accessToken->id]);

        $resolvedAgencyId = $agencyId ?? $user->agency_id;

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $user->load('role.permissions', 'agency', 'extraAgencies:id,name'),
            'resolved_agency_id' => $resolvedAgencyId !== null ? (int) $resolvedAgencyId : null,
        ]);
    }

    /**
     * Résout une adresse e-mail en agence(s) candidates, avant toute authentification —
     * alimente le sélecteur d'agence de l'écran de connexion. Réponse volontairement
     * neutre (jamais de 404/erreur distincte) pour ne jamais révéler si un e-mail existe
     * (anti-énumération, même principe que le message générique de login). Projection
     * minimale (id/name) : cette route est publique, jamais le modèle `Agency` complet.
     */
    public function agenciesForEmail(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $user = User::where('email', $request->string('email')->value())->where('is_active', true)->first();

        if ($user === null) {
            return response()->json(['type' => 'unknown', 'agencies' => []]);
        }

        if ($user->agency_id !== null) {
            $agency = Agency::where('id', $user->agency_id)->first();

            return response()->json([
                'type' => 'local',
                'agency' => $agency !== null ? ['id' => $agency->id, 'name' => $agency->name] : null,
            ]);
        }

        $agencies = Agency::where('pressing_id', $user->pressing_id)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['type' => 'global', 'agencies' => $agencies]);
    }

    public function logout(Request $request): JsonResponse
    {
        AuthEvent::record('logout', $request->user(), $request);
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Déconnecté.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->load('role.permissions', 'agency', 'extraAgencies:id,name'));
    }
}
