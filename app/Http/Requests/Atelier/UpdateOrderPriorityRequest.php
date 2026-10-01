<?php

namespace App\Http\Requests\Atelier;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOrderPriorityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.update_status');
    }

    public function rules(): array
    {
        return [
            'priority' => ['required', 'string', 'in:urgent,haute,normale'],
        ];
    }
}
