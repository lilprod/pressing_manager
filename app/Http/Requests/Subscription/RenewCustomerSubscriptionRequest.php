<?php

namespace App\Http\Requests\Subscription;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RenewCustomerSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('subscriptions.manage');
    }

    public function rules(): array
    {
        return [
            'method' => ['required', Rule::in(['espece', 'carte', 'flooz', 'tmoney'])],
            'external_reference' => ['nullable', 'string', 'max:255'],
        ];
    }
}
