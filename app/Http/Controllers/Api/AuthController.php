<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use OpenApi\Attributes as OA;

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

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ["Identifiants invalides."],
            ]);
        }

        $token = $user->createToken($data['device_name']);

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $user->load('role.permissions', 'agency'),
        ]);
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
