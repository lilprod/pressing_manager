<?php

namespace App\Http\Requests\Role;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('users.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'scope' => ['required', 'in:global,agency,flexible'],
            'permission_ids' => ['array'],
            'permission_ids.*' => [Rule::exists('permissions', 'id')],
        ];
    }
}
