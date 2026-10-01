<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderPickupItem extends Model
{
    protected $fillable = ['order_pickup_id', 'order_item_id', 'quantity'];

    public function pickup(): BelongsTo
    {
        return $this->belongsTo(OrderPickup::class, 'order_pickup_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }
}
