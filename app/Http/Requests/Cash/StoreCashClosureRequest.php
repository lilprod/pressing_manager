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
            'counted_balance' => ['required', 'integer', 'min:0'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
