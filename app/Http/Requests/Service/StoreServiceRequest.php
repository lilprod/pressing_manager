<?php

namespace App\Http\Requests\Service;

use Illuminate\Foundation\Http\FormRequest;

class StoreServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('services.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:30', 'unique:services,code'],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'in:nettoyage,repassage,retouche,teinture,autre'],
            'description' => ['nullable', 'string'],
            'base_price' => ['required', 'integer', 'min:0'],
            'estimated_duration_hours' => ['required', 'integer', 'min:1'],
            'is_active' => ['boolean'],
        ];
    }
}
