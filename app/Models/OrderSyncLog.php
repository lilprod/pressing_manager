<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderSyncLog extends Model
{
    protected $fillable = ['order_id', 'client_local_uuid', 'conflict_type', 'resolution_notes', 'synced_at'];

    protected function casts(): array
    {
        return [
            'synced_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
