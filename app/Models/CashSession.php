<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashSession extends Model
{
    use Auditable;

    protected $fillable = [
        'agency_id', 'user_id', 'register_label', 'status', 'opening_float', 'opened_at', 'paused_at',
        'closed_at', 'expected_amount', 'counted_amount', 'variance', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'paused_at' => 'datetime',
            'closed_at' => 'datetime',
            'opening_float' => 'integer',
            'expected_amount' => 'integer',
            'counted_amount' => 'integer',
            'variance' => 'integer',
        ];
    }

    /** Caissier de la session (« cashier » : évite la collision avec la colonne user_id). */
    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /** Fond de caisse + espèces encaissées pendant la session. */
    public function expectedCash(): int
    {
        return $this->opening_float + (int) $this->payments()->where('status', 'complete')->where('method', 'espece')->sum('amount');
    }
}
