<?php

namespace App\Http\Requests\Order;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.manage');
    }

    public function rules(): array
    {
        return [
            // Volontairement limité aux champs sans impact tarifaire (articles, prix,
            // remise restent figés une fois le dépôt créé — voir OrderController::update()).
            'notes' => ['nullable', 'string'],
            'promised_at' => ['nullable', 'date'],
            'is_express' => ['sometimes', 'boolean'],
        ];
    }
}
