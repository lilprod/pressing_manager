<?php

namespace App\Http\Requests\Stock;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreStockMovementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('stocks.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            'type' => ['required', Rule::in(['entree', 'sortie'])],
            'quantity' => ['required', 'integer', 'min:1'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'unit_cost' => ['nullable', 'integer', 'min:0'],
            'reason' => ['required', Rule::in(['livraison', 'consommation', 'perte', 'ajustement'])],
            'notes' => ['nullable', 'string'],
        ];
    }
}
