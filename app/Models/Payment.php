<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use Auditable;

    protected $fillable = [
        'agency_id', 'invoice_id', 'client_id', 'method', 'amount', 'currency', 'status',
        'external_reference', 'payload', 'received_by', 'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'paid_at' => 'datetime',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /**
     * Nommée `receiver` (pas `receivedBy`) : chargée pour la première fois par la
     * fiche dépôt (historique des paiements) — une relation `receivedBy()` sur un
     * modèle qui a déjà une colonne `received_by` écraserait silencieusement la
     * valeur brute de la colonne dans le JSON (piège déjà documenté dans
     * CLAUDE.md pour Order::createdBy()/CashMovement/CashClosure).
     */
    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
