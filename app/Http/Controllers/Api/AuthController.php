<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
            throw new HttpException(423, 'Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.');
        }

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            if ($user !== null) {
                $user->registerFailedLogin();
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

        $user->registerSuccessfulLogin();

        // Nouveaux jetons désormais bornés dans le temps (voir CLAUDE.md « Se souvenir
        // de moi ») : 30 jours si "remember" est coché, 12h sinon — jamais plus éternel
        // pour un nouveau login. Les jetons déjà émis avant ce changement restent
        // éternels (pas de migration de données, comportement forward-only).
        $expiresAt = $request->boolean('remember') ? now()->addDays(30) : now()->addHours(12);
        $token = $user->createToken($data['device_name'], ['*'], $expiresAt);

        $resolvedAgencyId = $data['agency_id'] ?? $user->agency_id;

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $user->load('role.permissions', 'agency'),
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
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Déconnecté.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->load('role.permissions', 'agency'));
    }
}
