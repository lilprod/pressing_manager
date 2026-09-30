<?php

namespace App\Http\Requests\License;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLicensePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('licenses.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'days' => ['sometimes', 'required', 'integer', 'min:1'],
            'price' => ['sometimes', 'required', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
