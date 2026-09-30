<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashClosure extends Model
{
    use Auditable;

    protected $fillable = [
        'agency_id', 'business_date', 'opening_balance', 'cash_payments_total', 'manual_in_total',
        'manual_out_total', 'expected_balance', 'counted_balance', 'variance', 'notes', 'closed_by', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'closed_at' => 'datetime',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /**
     * Nommée `closer` (pas `closedBy`) : une relation chargée sous une clé qui
     * se snake_case vers le nom d'une colonne existante ("closed_by") écrase
     * cette colonne dans la sérialisation JSON (array_merge dans Model::toArray()).
     */
    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
