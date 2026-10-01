<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrderItem extends Model
{
    use Auditable, HasFactory;

    protected $fillable = [
        'order_id', 'agency_id', 'service_id', 'qr_code', 'description', 'intake_notes', 'quantity',
        'quantity_delivered', 'weight_kg', 'unit_price',
        'status', 'quality_check_result', 'quality_check_notes', 'is_damaged',
        'damage_compensation_amount', 'alteration_requested', 'ready_at', 'delivered_at',
    ];

    protected function casts(): array
    {
        return [
            'is_damaged' => 'boolean',
            'alteration_requested' => 'boolean',
            'weight_kg' => 'float',
            'ready_at' => 'datetime',
            'delivered_at' => 'datetime',
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

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderItemStatusHistory::class);
    }

    public function intakeConditions(): BelongsToMany
    {
        return $this->belongsToMany(IntakeCondition::class, 'order_item_intake_condition');
    }
}
