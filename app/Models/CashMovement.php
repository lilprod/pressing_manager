<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashMovement extends Model
{
    use Auditable;

    protected $fillable = [
        'agency_id', 'type', 'amount', 'reason', 'note', 'created_by', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /**
     * Nommée `creator` (pas `createdBy`) : une relation chargée sous une clé qui
     * se snake_case vers le nom d'une colonne existante ("created_by") écrase
     * cette colonne dans la sérialisation JSON (array_merge dans Model::toArray()).
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
