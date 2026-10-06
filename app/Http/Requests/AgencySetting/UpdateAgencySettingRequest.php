<?php

namespace App\Http\Requests\AgencySetting;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAgencySettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('agencies.manage');
    }

    public function rules(): array
    {
        return [
            'order_number_prefix' => ['nullable', 'string', 'max:10'],
            'order_number_suffix' => ['nullable', 'string', 'max:10'],
            'order_number_padding' => ['nullable', 'integer', 'min:1', 'max:10'],
            'standard_delay_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'express_delay_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'finishing_delay_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'allow_immediate_pickup' => ['boolean'],
            'block_pickup_if_unpaid' => ['boolean'],
            'washer_step_enabled' => ['boolean'],
            'sorter_step_enabled' => ['boolean'],
            'collection_fee' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'delivery_fee' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'minimum_order_amount' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'loyalty_amount_per_point' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'loyalty_redemption_threshold' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'loyalty_point_expiry_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'offline_sync_interval_minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'offline_retention_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ];
    }
}
