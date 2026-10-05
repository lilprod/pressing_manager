<?php

namespace App\Http\Requests\Payment;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreManualPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('payments.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'invoice_id' => ['nullable', 'integer', 'exists:invoices,id'],
            'amount' => ['required', 'integer', 'min:1'],
            'method' => ['required', Rule::in(['carte', 'flooz', 'tmoney'])],
            // V1, en attendant une intégration réelle avec un agrégateur : jamais le
            // numéro de carte complet (PCI) — 4 derniers chiffres ou référence de
            // transaction uniquement. Voir PaymentService::recordManualPayment().
            'reference' => ['required', 'string', 'max:255'],
        ];
    }
}
