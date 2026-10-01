<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

class StorePlatformUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('platform_users.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:platform_users,email'],
            'platform_role_id' => ['required', 'integer', 'exists:platform_roles,id'],
            'pressing_ids' => ['array'],
            'pressing_ids.*' => ['integer', 'exists:pressings,id'],
        ];
    }
}
