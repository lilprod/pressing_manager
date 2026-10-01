<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePlatformUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('platform_users.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('platform_users', 'email')->ignore($this->route('platformUser'))],
            'platform_role_id' => ['sometimes', 'required', 'integer', 'exists:platform_roles,id'],
            'is_active' => ['boolean'],
            'pressing_ids' => ['array'],
            'pressing_ids.*' => ['integer', 'exists:pressings,id'],
        ];
    }
}
