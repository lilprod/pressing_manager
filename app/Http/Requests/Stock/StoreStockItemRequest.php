<?php

namespace App\Http\Requests\Stock;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreStockItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('stocks.manage');
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:30', 'unique:stock_items,code'],
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['required', Rule::in(['unite', 'kg', 'litre', 'paquet'])],
            'category' => ['nullable', 'string', 'max:40'],
            'default_reorder_threshold' => ['required', 'integer', 'min:0'],
        ];
    }
}
