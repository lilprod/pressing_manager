<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgencyStockItem extends Model
{
    protected $fillable = ['agency_id', 'stock_item_id', 'quantity_on_hand', 'reorder_threshold_override'];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function stockItem(): BelongsTo
    {
        return $this->belongsTo(StockItem::class);
    }

    public function reorderThreshold(): int
    {
        return $this->reorder_threshold_override ?? $this->stockItem->default_reorder_threshold;
    }

    public function isLowStock(): bool
    {
        return $this->quantity_on_hand <= $this->reorderThreshold();
    }
}
