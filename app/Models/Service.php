<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Service extends Model
{
    use HasFactory;

    protected $fillable = [
        'code', 'name', 'category', 'billing_mode', 'description', 'base_price', 'estimated_duration_hours',
        'is_active', 'allow_discount', 'round_to_hundred', 'price_editable_at_counter',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'allow_discount' => 'boolean',
            'round_to_hundred' => 'boolean',
            'price_editable_at_counter' => 'boolean',
        ];
    }

    public function agencies(): BelongsToMany
    {
        return $this->belongsToMany(Agency::class, 'agency_services')
            ->withPivot(['price_override', 'is_active']);
    }

    public function priceTiers(): HasMany
    {
        return $this->hasMany(ServicePriceTier::class)->orderBy('weight_min');
    }

    public function priceHistories(): HasMany
    {
        return $this->hasMany(ServicePriceHistory::class)->orderByDesc('changed_at');
    }
}
