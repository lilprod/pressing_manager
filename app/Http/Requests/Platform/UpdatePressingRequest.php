<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePressingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['sometimes', 'required', 'string', 'max:20', Rule::unique('pressings', 'code')->ignore($this->route('pressing'))],
            'country_code' => ['nullable', 'string', 'size:2'],
            'platform_plan_id' => ['sometimes', 'required', 'integer', 'exists:platform_plans,id'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:50'],
            'license_starts_at' => ['nullable', 'date'],
            'license_expires_at' => ['nullable', 'date', 'after_or_equal:license_starts_at'],
            // Chantier « Re-audit Pressing — édition post-création » (CLAUDE.md) :
            // couleurs/sécurité (AppSetting, pressing-scoped) et programme de fidélité
            // (LoyaltyTier, pressing-scoped) deviennent réellement éditables après
            // création — mêmes règles que StorePressingRequest. `workshop_steps` reste
            // volontairement absent d'ici (agency-scoped, voir CLAUDE.md pour la
            // décision : create-only, modifiable ensuite par agence sur
            // /settings/operational côté tenant).
            'primary_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'security_policy' => ['nullable', 'array'],
            'security_policy.session_timeout_minutes' => ['nullable', 'integer', 'min:1'],
            'security_policy.password_min_length' => ['nullable', 'integer', 'min:4', 'max:128'],
            'security_policy.password_require_uppercase' => ['nullable', 'boolean'],
            'security_policy.password_require_number' => ['nullable', 'boolean'],
            'security_policy.password_require_symbol' => ['nullable', 'boolean'],
            'security_policy.password_expiry_days' => ['nullable', 'integer', 'min:1'],
            'loyalty_tiers' => ['nullable', 'array'],
            'loyalty_tiers.*.id' => ['nullable', 'integer'],
            'loyalty_tiers.*.name' => ['required', 'string', 'max:255'],
            'loyalty_tiers.*.min_spend_amount' => ['required', 'integer', 'min:0', 'distinct'],
            'loyalty_tiers.*.discount_rate' => ['required', 'numeric', 'min:0', 'max:1'],
            'loyalty_tiers.*.point_multiplier' => ['sometimes', 'numeric', 'min:1', 'max:9.99'],
            'loyalty_tiers.*.benefit_description' => ['nullable', 'string', 'max:255'],
        ];
    }
}
