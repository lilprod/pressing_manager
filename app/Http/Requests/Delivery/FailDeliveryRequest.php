<?php

namespace App\Http\Requests\Delivery;

use Illuminate\Foundation\Http\FormRequest;

class FailDeliveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('deliveries.fulfill');
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:500'],
        ];
    }
}
