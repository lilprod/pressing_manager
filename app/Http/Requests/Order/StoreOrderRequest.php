<?php

namespace App\Http\Requests\Order;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'client_local_uuid' => ['nullable', 'uuid'],
            'is_express' => ['boolean'],
            'promised_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'discount_amount' => ['nullable', 'integer', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'integer', 'exists:services,id'],
            'items.*.treatment_type_id' => ['nullable', 'integer', 'exists:treatment_types,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.weight_kg' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.description' => ['nullable', 'string', 'max:255'],
            'items.*.intake_notes' => ['nullable', 'string'],
            'items.*.intake_condition_ids' => ['nullable', 'array'],
            'items.*.intake_condition_ids.*' => ['integer', 'exists:intake_conditions,id'],
            // Encaissement optionnel intégré à la création (refonte flux comptoir) :
            // absents, le dépôt se comporte exactement comme avant (aucune facture créée).
            'payment_method' => ['nullable', Rule::in(['espece', 'carte', 'flooz', 'tmoney'])],
            'payment_amount' => ['nullable', 'required_with:payment_method', 'integer', 'min:1'],
            'payment_reference' => [
                'nullable',
                Rule::requiredIf(fn () => $this->input('payment_method') && $this->input('payment_method') !== 'espece'),
                'string',
                'max:255',
            ],
        ];
    }
}
