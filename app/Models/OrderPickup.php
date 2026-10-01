<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrderPickup extends Model
{
    protected $fillable = [
        'order_id', 'agency_id', 'recipient_type', 'recipient_name',
        'condition_status', 'condition_notes', 'payment_collected_amount', 'payment_id',
        'balance_overridden', 'override_reason', 'processed_by', 'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'balance_overridden' => 'boolean',
            'processed_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    // Nommé différemment de la colonne `processed_by` : voir le piège documenté dans
    // CLAUDE.md (une relation au même nom snake_case qu'une colonne FK écrase celle-ci
    // dans Model::toArray()).
    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderPickupItem::class);
    }
}
