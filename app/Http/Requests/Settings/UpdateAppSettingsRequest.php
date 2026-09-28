<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAppSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('agencies.manage');
    }

    public function rules(): array
    {
        return [
            'pressing_name' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'favicon' => ['nullable', 'image', 'max:512'],

            // Politique de sécurité : null/0 pour password_expiry_days désactive l'expiration.
            'password_expiry_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'password_expiry_warning_days' => ['nullable', 'integer', 'min:1', 'max:90'],
            'session_timeout_minutes' => ['nullable', 'integer', 'min:5', 'max:1440'],
            'password_min_length' => ['nullable', 'integer', 'min:6', 'max:64'],
            'password_require_uppercase' => ['boolean'],
            'password_require_number' => ['boolean'],
            'password_require_symbol' => ['boolean'],
        ];
    }
}
