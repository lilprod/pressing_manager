<?php

namespace App\Http\Requests\License;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RenewLicenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('licenses.manage');
    }

    public function rules(): array
    {
        return [
            'plan' => ['required', Rule::exists('license_plans', 'slug')->where('is_active', true)],
            'method' => ['required', Rule::in(['espece', 'carte', 'flooz', 'tmoney'])],
            'external_reference' => ['nullable', 'string', 'max:255'],
        ];
    }
}
