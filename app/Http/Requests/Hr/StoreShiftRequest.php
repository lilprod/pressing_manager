<?php

namespace App\Http\Requests\Hr;

use Illuminate\Foundation\Http\FormRequest;

class StoreShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('hr.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
