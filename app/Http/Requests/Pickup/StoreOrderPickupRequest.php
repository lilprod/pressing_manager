<?php

namespace App\Http\Requests\Pickup;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreOrderPickupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.manage');
    }

    public function rules(): array
    {
        return [
            'recipient_type' => ['required', Rule::in(['client', 'tiers'])],
            'recipient_name' => ['required', 'string', 'max:255'],
            'condition_status' => ['required', Rule::in(['conforme', 'reserve', 'anomalie'])],
            'condition_notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.order_item_id' => ['required', 'integer', 'exists:order_items,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'payment_amount' => ['nullable', 'integer', 'min:0'],
            'override_unpaid' => ['nullable', 'boolean'],
            'override_reason' => ['required_if:override_unpaid,true', 'nullable', 'string', 'max:1000'],
        ];
    }
}
