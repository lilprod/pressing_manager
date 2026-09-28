<?php

namespace App\Http\Requests\Service;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('services.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['sometimes', 'string', 'max:30', Rule::unique('services', 'code')->ignore($this->route('service'))],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category' => ['sometimes', 'required', 'in:nettoyage,lavage,repassage,retouche,teinture,autre'],
            'description' => ['nullable', 'string'],
            'base_price' => ['sometimes', 'required', 'integer', 'min:0'],
            'estimated_duration_hours' => ['sometimes', 'required', 'integer', 'min:1'],
            'is_active' => ['boolean'],
        ];
    }
}
