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
            'payment_method' => ['nullable', Rule::in(['espece', 'carte', 'flooz', 'tmoney'])],
            // V1, en attendant une intégration réelle avec un agrégateur (Flooz, T-Money,
            // gateway carte) : carte/mobile money sont confirmés manuellement par le
            // caissier (PaymentService::recordManualPayment), jamais le numéro de carte
            // complet (PCI) — 4 derniers chiffres ou référence de transaction uniquement.
            'payment_reference' => [
                Rule::requiredIf(fn () => in_array($this->input('payment_method'), ['carte', 'flooz', 'tmoney'], true)),
                'nullable', 'string', 'max:255',
            ],
            'override_unpaid' => ['nullable', 'boolean'],
            'override_reason' => ['required_if:override_unpaid,true', 'nullable', 'string', 'max:1000'],
        ];
    }
}
