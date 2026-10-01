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
        ];
    }
}
