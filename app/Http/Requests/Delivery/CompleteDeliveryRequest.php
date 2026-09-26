<?php

namespace App\Http\Requests\Delivery;

use Illuminate\Foundation\Http\FormRequest;

class CompleteDeliveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('deliveries.fulfill');
    }

    public function rules(): array
    {
        return [
            'photo' => ['required', 'image', 'max:8192'],
            'signature' => ['required', 'image', 'max:2048'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
