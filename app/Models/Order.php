<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'agency_id', 'client_id', 'created_by', 'order_number', 'client_local_uuid',
        'status', 'is_express', 'source', 'sync_status', 'promised_at', 'delivered_at',
        'total_amount', 'discount_amount', 'loyalty_discount_amount', 'promotion_id', 'promotion_discount_amount',
        'notes', 'priority', 'washer_id', 'sorter_id',
    ];

    protected function casts(): array
    {
        return [
            'is_express' => 'boolean',
            'promised_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /**
     * Nommée `creator` (pas `createdBy`) : une relation chargée sous une clé qui
     * correspond au snake_case du nom de colonne FK (`created_by`) écraserait
     * silencieusement la valeur brute de la colonne dans la sérialisation JSON.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function invoice(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function pickups(): HasMany
    {
        return $this->hasMany(OrderPickup::class);
    }

    /** Responsable de l'étape Laveur (vue Kanban atelier, section 04 Figma). */
    public function washer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'washer_id');
    }

    /** Responsable de l'étape Classeur (vue Kanban atelier, section 04 Figma). */
    public function sorter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sorter_id');
    }
}
