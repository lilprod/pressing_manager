<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use App\Rules\PasswordPolicy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Cache;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $pressingId = $this->resolveUser()?->pressing_id;

        return [
            'token' => ['required', 'string'],
            'password' => [
                'required',
                'confirmed',
                ...($pressingId !== null ? [new PasswordPolicy($pressingId)] : ['string']),
            ],
            'password_confirmation' => ['required'],
        ];
    }

    /**
     * Résout l'utilisateur ciblé par le jeton, uniquement pour appliquer la bonne
     * politique de mot de passe (par pressing) pendant la validation — le contrôleur
     * refait sa propre résolution/consommation du jeton, ce n'est qu'une lecture.
     */
    public function resolveUser(): ?User
    {
        $token = $this->input('token');
        if (! is_string($token) || $token === '') {
            return null;
        }

        $userId = Cache::get('password.reset.'.$token);

        return $userId ? User::find($userId) : null;
    }
}
