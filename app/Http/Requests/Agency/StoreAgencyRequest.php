<?php

namespace App\Http\Requests\Agency;

use Illuminate\Foundation\Http\FormRequest;

class StoreAgencyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('agencies.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:20', 'unique:agencies,code'],
            'name' => ['required', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'unclaimed_item_threshold_days' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['boolean'],
            'workshop_capacity' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
