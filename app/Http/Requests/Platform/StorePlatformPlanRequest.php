<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePlatformPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('licenses.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'price' => ['required', 'integer', 'min:0'],
            'duration_days' => ['required', 'integer', 'min:1'],
            'currency' => ['nullable', 'string', 'size:3'],
            'is_active' => ['boolean'],
            'agencies_limit' => ['nullable', 'integer', 'min:1'],
            'users_limit' => ['nullable', 'integer', 'min:1'],
            'storage_limit_gb' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
