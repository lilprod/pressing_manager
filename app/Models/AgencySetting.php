<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Réglages opérationnels par agence (CLAUDE.md « Opérationnel »), 1:1 avec `Agency`.
 * Singleton auto-créé — même pattern que `AppSetting::current()`.
 */
class AgencySetting extends Model
{
    use Auditable;

    protected $fillable = [
        'agency_id',
        'order_number_prefix', 'order_number_suffix', 'order_number_padding',
        'standard_delay_hours', 'express_delay_hours', 'finishing_delay_hours',
        'allow_immediate_pickup', 'block_pickup_if_unpaid',
        'washer_step_enabled', 'sorter_step_enabled',
        'collection_fee', 'delivery_fee', 'minimum_order_amount',
        'loyalty_amount_per_point', 'loyalty_redemption_threshold', 'loyalty_point_expiry_months',
        'offline_sync_interval_minutes', 'offline_retention_days',
    ];

    protected function casts(): array
    {
        return [
            'order_number_padding' => 'integer',
            'standard_delay_hours' => 'integer',
            'express_delay_hours' => 'integer',
            'finishing_delay_hours' => 'integer',
            'allow_immediate_pickup' => 'boolean',
            'block_pickup_if_unpaid' => 'boolean',
            'washer_step_enabled' => 'boolean',
            'sorter_step_enabled' => 'boolean',
            'collection_fee' => 'integer',
            'delivery_fee' => 'integer',
            'minimum_order_amount' => 'integer',
            'loyalty_amount_per_point' => 'integer',
            'loyalty_redemption_threshold' => 'integer',
            'loyalty_point_expiry_months' => 'integer',
            'offline_sync_interval_minutes' => 'integer',
            'offline_retention_days' => 'integer',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /** Défauts sûrs : block_pickup_if_unpaid=true préserve le comportement actuel
     * (toujours bloqué) tant que personne n'a explicitement choisi de l'assouplir. */
    public static function forAgency(int $agencyId): self
    {
        return static::query()->where('agency_id', $agencyId)->first()
            ?? static::create(['agency_id' => $agencyId])->refresh();
    }

    protected function auditAgencyId(): ?int
    {
        return $this->agency_id;
    }
}
