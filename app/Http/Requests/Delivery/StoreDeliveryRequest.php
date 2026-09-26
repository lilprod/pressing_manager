<?php

namespace App\Http\Requests\Delivery;

use Illuminate\Foundation\Http\FormRequest;

class StoreDeliveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('deliveries.manage');
    }

    public function rules(): array
    {
        return [
            'order_id' => ['required', 'integer', 'exists:orders,id'],
            'address' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'delivery_zone_id' => ['nullable', 'integer', 'exists:delivery_zones,id'],
            'livreur_id' => ['nullable', 'integer', 'exists:users,id'],
            'fee' => ['nullable', 'integer', 'min:0'],
            'scheduled_at' => ['nullable', 'date'],
        ];
    }
}
