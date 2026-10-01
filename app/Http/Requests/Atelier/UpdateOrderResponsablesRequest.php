<?php

namespace App\Http\Requests\Atelier;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOrderResponsablesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.update_status');
    }

    public function rules(): array
    {
        return [
            'washer_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'sorter_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ];
    }
}
