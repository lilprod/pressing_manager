<?php

namespace App\Http\Requests\Agency;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAgencyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('agencies.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['sometimes', 'string', 'max:20', Rule::unique('agencies', 'code')->ignore($this->route('agency'))],
            'name' => ['sometimes', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'unclaimed_item_threshold_days' => ['sometimes', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
            'workshop_capacity' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
