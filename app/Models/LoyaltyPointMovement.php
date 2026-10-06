<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ledger append-only des points de fidélité — voir la migration pour le détail. */
class LoyaltyPointMovement extends Model
{
    public $timestamps = false;

    protected $fillable = ['client_id', 'agency_id', 'payment_id', 'points', 'reason', 'created_at'];

    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
