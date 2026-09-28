<?php

namespace App\Http\Requests\License;

use Illuminate\Foundation\Http\FormRequest;

class StoreLicensePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('licenses.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'days' => ['required', 'integer', 'min:1'],
            'price' => ['required', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
