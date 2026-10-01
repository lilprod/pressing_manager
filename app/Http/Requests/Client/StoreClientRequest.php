<?php

namespace App\Http\Requests\Client;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('clients.manage');
    }

    public function rules(): array
    {
        $agencyId = $this->user()->agency_id ?? $this->input('agency_id');

        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'phone' => [
                'required', 'string', 'max:30',
                Rule::unique('clients', 'phone')->where('agency_id', $agencyId),
            ],
            'phone_secondary' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'contact_preference' => ['nullable', 'string', Rule::in(['whatsapp', 'call', 'sms', 'email'])],
            'referral_code' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
            'sms_consent' => ['sometimes', 'boolean'],
            'email_consent' => ['sometimes', 'boolean'],
        ];
    }
}
