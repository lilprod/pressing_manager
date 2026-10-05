<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\User;
use App\Notifications\PasswordResetNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Réinitialisation de mot de passe en libre-service — voir CLAUDE.md « 01
 * Authentification ». Patron de jeton repris de `PlatformAuthController` (challenge
 * MFA : `Str::random(48)` + cache à TTL), génération/hachage du nouveau mot de passe
 * repris de `UserController::resetPassword()`. E-mail uniquement (aucune passerelle
 * SMS réelle dans l'app).
 */
class PasswordResetController extends Controller
{
    private const TOKEN_TTL_MINUTES = 30;

    private const GENERIC_MESSAGE = 'Si ce compte existe, un e-mail de réinitialisation a été envoyé.';

    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        $user = User::where('email', $request->string('email')->value())->where('is_active', true)->first();

        if ($user !== null) {
            $token = Str::random(48);
            Cache::put('password.reset.'.$token, $user->id, now()->addMinutes(self::TOKEN_TTL_MINUTES));
            $user->notify(new PasswordResetNotification($token));
        }

        // Réponse volontairement identique que le compte existe ou non (anti-énumération).
        return response()->json(['message' => self::GENERIC_MESSAGE]);
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $token = $request->string('token')->value();
        $userId = Cache::get('password.reset.'.$token);

        if ($userId === null) {
            throw new HttpException(422, 'Lien de réinitialisation invalide ou expiré.');
        }

        $user = User::find($userId);

        if ($user === null) {
            Cache::forget('password.reset.'.$token);
            throw new HttpException(422, 'Lien de réinitialisation invalide ou expiré.');
        }

        $user->forceFill([
            'password' => Hash::make($request->string('password')->value()),
            'must_change_password' => false,
            'password_changed_at' => now(),
        ])->save();

        // Une réinitialisation réussie est une preuve de possession du compte : on lève
        // aussi le verrouillage éventuel (même sémantique que `registerSuccessfulLogin()`).
        $user->registerSuccessfulLogin();

        Cache::forget('password.reset.'.$token);

        return response()->json(['message' => 'Mot de passe réinitialisé avec succès.']);
    }
}
