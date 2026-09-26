<?php

namespace App\Http\Requests\Hr;

use Illuminate\Foundation\Http\FormRequest;

class ClockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('hr.clock');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
        ];
    }
}
