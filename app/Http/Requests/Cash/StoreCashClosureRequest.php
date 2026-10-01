<?php

namespace App\Http\Requests\Cash;

use Illuminate\Foundation\Http\FormRequest;

class StoreCashClosureRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('payments.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'business_date' => ['required', 'date', 'before_or_equal:today'],
            'counts' => ['required', 'array'],
            'counts.espece' => ['required', 'integer', 'min:0'],
            'counts.mobile_money' => ['required', 'integer', 'min:0'],
            'counts.carte' => ['required', 'integer', 'min:0'],
            'checklist' => ['required', 'array'],
            'checklist.*' => ['string'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
