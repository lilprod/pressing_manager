<?php

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

class RenewPressingLicenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('licenses.manage');
    }

    public function rules(): array
    {
        return [
            'platform_plan_id' => ['required', 'integer', 'exists:platform_plans,id'],
            'method' => ['required', 'string', 'in:espece,carte,flooz,tmoney'],
            'external_reference' => ['nullable', 'string', 'max:255'],
        ];
    }
}
