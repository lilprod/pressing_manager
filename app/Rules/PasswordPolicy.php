<?php

namespace App\Rules;

use App\Models\AppSetting;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Applique la politique de mot de passe configurée dans les Paramètres
 * (longueur minimale, majuscule/chiffre/symbole requis).
 */
class PasswordPolicy implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $settings = AppSetting::current();
        $password = (string) $value;

        if (mb_strlen($password) < $settings->password_min_length) {
            $fail("Le mot de passe doit contenir au moins {$settings->password_min_length} caractères.");

            return;
        }

        if ($settings->password_require_uppercase && ! preg_match('/[A-Z]/', $password)) {
            $fail('Le mot de passe doit contenir au moins une majuscule.');

            return;
        }

        if ($settings->password_require_number && ! preg_match('/[0-9]/', $password)) {
            $fail('Le mot de passe doit contenir au moins un chiffre.');

            return;
        }

        if ($settings->password_require_symbol && ! preg_match('/[^a-zA-Z0-9]/', $password)) {
            $fail('Le mot de passe doit contenir au moins un caractère spécial.');
        }
    }
}
