<?php

namespace App\Http\Requests\Subscription;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriptionPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('subscriptions.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => ['nullable', 'integer', 'exists:agencies,id'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'quota_type' => ['required', Rule::in(['kg', 'articles'])],
            'quota_amount' => ['required', 'integer', 'min:1'],
            'price' => ['required', 'integer', 'min:0'],
            'duration_days' => ['required', 'integer', 'min:1'],
        ];
    }
}
