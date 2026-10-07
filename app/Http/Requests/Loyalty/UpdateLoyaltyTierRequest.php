<?php

namespace App\Http\Requests\Loyalty;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLoyaltyTierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('clients.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'min_spend_amount' => ['sometimes', 'required', 'integer', 'min:0', Rule::unique('loyalty_tiers', 'min_spend_amount')->where('pressing_id', $this->user()->pressing_id)->ignore($this->route('loyaltyTier'))],
            'discount_rate' => ['sometimes', 'required', 'numeric', 'min:0', 'max:1'],
            'point_multiplier' => ['sometimes', 'numeric', 'min:1', 'max:9.99'],
            'benefit_description' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ];
    }
}
