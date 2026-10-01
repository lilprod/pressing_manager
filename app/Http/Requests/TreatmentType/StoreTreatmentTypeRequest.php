<?php

namespace App\Http\Requests\TreatmentType;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTreatmentTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('services.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:30', Rule::unique('treatment_types', 'code')->where('pressing_id', $this->user()->pressing_id)],
            'name' => ['required', 'string', 'max:255'],
            'price_ratio' => ['required', 'numeric', 'min:0.01', 'max:99.99'],
            'is_active' => ['boolean'],
        ];
    }
}
