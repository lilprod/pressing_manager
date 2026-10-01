<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

class StorePressingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:20', 'unique:pressings,code'],
            'country_code' => ['nullable', 'string', 'size:2'],
            'platform_plan_id' => ['required', 'integer', 'exists:platform_plans,id'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:50'],
            'license_starts_at' => ['nullable', 'date'],
            'license_expires_at' => ['nullable', 'date', 'after_or_equal:license_starts_at'],
            // Provisionnement réel (pivot multi-tenant, voir CLAUDE.md) : première agence
            // + compte manager créés avec le pressing, pas juste une fiche de registre.
            'agency_code' => ['required', 'string', 'max:20'],
            'agency_name' => ['required', 'string', 'max:255'],
            'agency_city' => ['nullable', 'string', 'max:255'],
            'manager_name' => ['required', 'string', 'max:255'],
            'manager_email' => ['required', 'email', 'max:255', 'unique:users,email'],
        ];
    }
}
