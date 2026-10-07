<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md, node Figma 72:20021) : modèle
 * entièrement nouveau, le volet promotions n'existait pas du tout côté backend.
 * Référentiel pressing-scopé, même portée que `LoyaltyTier`. Aucune ligne dans
 * `agencies` (pivot) = éligible à toutes les agences du pressing (même convention
 * que « Toutes » affiché dans la maquette).
 */
class Promotion extends Model
{
    use HasFactory;

    protected $fillable = [
        'pressing_id', 'name', 'code', 'discount_type', 'discount_value', 'max_discount_amount',
        'starts_at', 'ends_at', 'quota_total', 'quota_per_client', 'minimum_order_amount',
        'combinable_with_loyalty', 'is_active',
    ];

    protected $appends = ['status'];

    protected function casts(): array
    {
        return [
            'discount_value' => 'integer',
            'max_discount_amount' => 'integer',
            'starts_at' => 'date',
            'ends_at' => 'date',
            'quota_total' => 'integer',
            'quota_per_client' => 'integer',
            'minimum_order_amount' => 'integer',
            'combinable_with_loyalty' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    /** « Brouillon » (jamais publiée), « Planifiée » (publiée, pas encore démarrée),
     * « Active » (publiée, dans sa période), « Terminée » (publiée, période passée ou
     * quota épuisé) — même vocabulaire que la maquette. */
    protected function status(): Attribute
    {
        return Attribute::get(function () {
            if (! $this->is_active) {
                return 'draft';
            }
            $today = now()->startOfDay();
            if ($today->lt($this->starts_at)) {
                return 'scheduled';
            }
            if ($today->gt($this->ends_at)) {
                return 'ended';
            }
            $usageCount = $this->usages_count ?? $this->usages()->count();
            if ($this->quota_total !== null && $usageCount >= $this->quota_total) {
                return 'ended';
            }

            return 'active';
        });
    }

    public function pressing(): BelongsTo
    {
        return $this->belongsTo(Pressing::class);
    }

    public function agencies(): BelongsToMany
    {
        return $this->belongsToMany(Agency::class, 'promotion_agency');
    }

    public function usages(): HasMany
    {
        return $this->hasMany(PromotionUsage::class);
    }

    public function isEligibleForAgency(int $agencyId): bool
    {
        $eligibleIds = $this->agencies()->pluck('agencies.id');

        return $eligibleIds->isEmpty() || $eligibleIds->contains($agencyId);
    }
}
