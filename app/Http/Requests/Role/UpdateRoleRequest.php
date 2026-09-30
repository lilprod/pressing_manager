<?php

namespace App\Http\Requests\Role;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('users.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'scope' => ['sometimes', 'required', 'in:global,agency,flexible'],
            'permission_ids' => ['sometimes', 'array'],
            'permission_ids.*' => [Rule::exists('permissions', 'id')],
        ];
    }
}
