<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Pas de politique de mot de passe configurable par pressing ici (App\Rules\PasswordPolicy
 * est scopée par pressing_id, que platform_users n'a pas) — politique fixe, délibérément
 * plus stricte que le défaut tenant vu le niveau de privilège de ces comptes.
 */
class ChangePlatformPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'current_password:platform'],
            'new_password' => ['required', 'confirmed', Password::min(12)->mixedCase()->numbers()],
        ];
    }
}
