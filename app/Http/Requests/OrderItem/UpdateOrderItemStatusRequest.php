<?php

namespace App\Http\Requests\OrderItem;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOrderItemStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.update_status');
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in(['trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'non_recupere', 'perdu'])],
            'quality_check_result' => ['nullable', Rule::in(['ok', 'echec'])],
            'quality_check_notes' => ['nullable', 'string'],
            'is_damaged' => ['boolean'],
            'damage_compensation_amount' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
