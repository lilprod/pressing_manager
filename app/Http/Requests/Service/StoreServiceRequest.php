<?php

namespace App\Http\Requests\Service;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('services.manage');
    }

    public function rules(): array
    {
        return [
            'accepted_condition_ids' => ['sometimes', 'array'],
            'accepted_condition_ids.*' => ['integer', 'exists:intake_conditions,id'],
            'code' => ['required', 'string', 'max:30', Rule::unique('services', 'code')->where('pressing_id', $this->user()->pressing_id)],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:60'],
            'home_delivery_enabled' => ['boolean'],
            'treatment_rates' => ['sometimes', 'array'],
            'treatment_rates.*.treatment_type_id' => ['required', 'integer', 'distinct', Rule::exists('treatment_types', 'id')->where('pressing_id', $this->user()->pressing_id)],
            'treatment_rates.*.price' => ['nullable', 'integer', 'min:0'],
            'treatment_rates.*.delay_hours' => ['nullable', 'integer', 'min:1'],
            'finish_option_ids' => ['sometimes', 'array'],
            'finish_option_ids.*' => ['integer', 'distinct', Rule::exists('finish_options', 'id')->where('pressing_id', $this->user()->pressing_id)],
            'associated_service_ids' => ['sometimes', 'array'],
            'associated_service_ids.*' => ['integer', 'distinct', Rule::exists('services', 'id')->where('pressing_id', $this->user()->pressing_id)],
            'price_tiers.*.treatment_prices' => ['nullable', 'array'],
            'price_tiers.*.treatment_prices.*' => ['nullable', 'integer', 'min:0'],
            'billing_mode' => ['required', 'in:piece,kg,mixte'],
            'description' => ['nullable', 'string'],
            'base_price' => ['required_unless:billing_mode,kg', 'nullable', 'integer', 'min:0'],
            'estimated_duration_hours' => ['required', 'integer', 'min:1'],
            'priority' => ['sometimes', 'in:standard,haute'],
            'is_active' => ['boolean'],
            'allow_discount' => ['boolean'],
            'round_to_hundred' => ['boolean'],
            'price_editable_at_counter' => ['boolean'],
            'price_tiers' => ['required_if:billing_mode,kg,mixte', 'array'],
            'price_tiers.*.weight_min' => ['required', 'numeric', 'min:0'],
            'price_tiers.*.weight_max' => ['nullable', 'numeric', 'gt:price_tiers.*.weight_min'],
            'price_tiers.*.price_per_kg' => ['required', 'integer', 'min:0'],
        ];
    }
}
