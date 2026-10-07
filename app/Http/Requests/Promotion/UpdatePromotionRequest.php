<?php

namespace App\Http\Requests\Promotion;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePromotionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('clients.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => [
                'sometimes', 'required', 'string', 'max:30', 'alpha_dash',
                Rule::unique('promotions', 'code')->where('pressing_id', $this->user()->pressing_id)->ignore($this->route('promotion')),
            ],
            'discount_type' => ['sometimes', 'required', Rule::in(['percentage', 'fixed'])],
            'discount_value' => ['sometimes', 'required', 'integer', 'min:1', 'max:1000000'],
            'max_discount_amount' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['sometimes', 'required', 'date', 'after_or_equal:starts_at'],
            'quota_total' => ['nullable', 'integer', 'min:1'],
            'quota_per_client' => ['nullable', 'integer', 'min:1'],
            'minimum_order_amount' => ['nullable', 'integer', 'min:0'],
            'combinable_with_loyalty' => ['boolean'],
            'is_active' => ['boolean'],
            'agency_ids' => ['nullable', 'array'],
            'agency_ids.*' => [
                'integer',
                Rule::exists('agencies', 'id')->where('pressing_id', $this->user()->pressing_id),
            ],
        ];
    }
}
