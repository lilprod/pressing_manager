<?php

namespace App\Http\Requests\Delivery;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDeliveryStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('deliveries.fulfill');
    }

    public function rules(): array
    {
        return [
            // 'livree' passe par /complete (preuve requise), 'echouee' par /fail (motif requis).
            'status' => ['required', Rule::in(['en_cours', 'a_planifier'])],
        ];
    }
}
