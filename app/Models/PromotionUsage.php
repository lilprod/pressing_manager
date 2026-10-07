<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ledger append-only d'utilisation des promotions — voir migration pour le détail. */
class PromotionUsage extends Model
{
    public $timestamps = false;

    protected $fillable = ['promotion_id', 'client_id', 'order_id', 'agency_id', 'discount_amount', 'used_at'];

    protected function casts(): array
    {
        return [
            'discount_amount' => 'integer',
            'used_at' => 'datetime',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
