<?php

namespace App\Http\Requests\Subscription;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCustomerSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('subscriptions.manage');
    }

    public function rules(): array
    {
        return [
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'subscription_plan_id' => ['required', 'integer', 'exists:subscription_plans,id'],
            'method' => ['required', Rule::in(['espece', 'carte', 'flooz', 'tmoney'])],
            'external_reference' => ['nullable', 'string', 'max:255'],
        ];
    }
}
