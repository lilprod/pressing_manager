<?php

namespace App\Http\Requests\Service;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('services.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['sometimes', 'string', 'max:30', Rule::unique('services', 'code')->where('pressing_id', $this->user()->pressing_id)->ignore($this->route('service'))],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category' => ['sometimes', 'required', 'in:nettoyage,lavage,repassage,retouche,teinture,autre'],
            'billing_mode' => ['sometimes', 'required', 'in:piece,kg,mixte'],
            'description' => ['nullable', 'string'],
            'base_price' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'estimated_duration_hours' => ['sometimes', 'required', 'integer', 'min:1'],
            'priority' => ['sometimes', 'in:standard,haute'],
            'is_active' => ['boolean'],
            'allow_discount' => ['boolean'],
            'round_to_hundred' => ['boolean'],
            'price_editable_at_counter' => ['boolean'],
            'price_tiers' => ['sometimes', 'array'],
            'price_tiers.*.weight_min' => ['required', 'numeric', 'min:0'],
            'price_tiers.*.weight_max' => ['nullable', 'numeric', 'gt:price_tiers.*.weight_min'],
            'price_tiers.*.price_per_kg' => ['required', 'integer', 'min:0'],
        ];
    }
}
