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
            // Valeurs par défaut à la provision (Chantier D.2, CLAUDE.md) : tous optionnels,
            // repli sur les défauts DB existants (jamais écrasés par null) si omis.
            'primary_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'security_policy' => ['nullable', 'array'],
            'security_policy.session_timeout_minutes' => ['nullable', 'integer', 'min:1'],
            'security_policy.password_min_length' => ['nullable', 'integer', 'min:4', 'max:128'],
            'security_policy.password_require_uppercase' => ['nullable', 'boolean'],
            'security_policy.password_require_number' => ['nullable', 'boolean'],
            'security_policy.password_require_symbol' => ['nullable', 'boolean'],
            'security_policy.password_expiry_days' => ['nullable', 'integer', 'min:1'],
            'workshop_steps' => ['nullable', 'array'],
            'workshop_steps.washer_step_enabled' => ['nullable', 'boolean'],
            'workshop_steps.sorter_step_enabled' => ['nullable', 'boolean'],
            'loyalty_tiers' => ['nullable', 'array'],
            'loyalty_tiers.*.name' => ['required', 'string', 'max:255'],
            'loyalty_tiers.*.min_points' => ['required', 'integer', 'min:0', 'distinct'],
            'loyalty_tiers.*.discount_rate' => ['required', 'numeric', 'min:0', 'max:1'],
        ];
    }
}
