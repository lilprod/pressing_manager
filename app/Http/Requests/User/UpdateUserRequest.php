<?php

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('users.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($this->route('user'))],
            'phone' => ['nullable', 'string', 'max:30'],
            'role_id' => ['sometimes', 'required', 'integer', 'exists:roles,id'],
            'agency_id' => ['nullable', 'integer', 'exists:agencies,id'],
            'extra_agency_ids' => ['sometimes', 'array'],
            'extra_agency_ids.*' => ['integer', 'exists:agencies,id'],
            'mfa_required' => ['sometimes', 'boolean'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'employee_number' => ['nullable', 'string', 'max:40'],
            'send_invitation' => ['sometimes', 'boolean'],
            'is_active' => ['boolean'],
        ];
    }
}
