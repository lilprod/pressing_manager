<?php

namespace App\Http\Requests\Service;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAgencyServicePricingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('services.manage');
    }

    public function rules(): array
    {
        return [
            'price_override' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
