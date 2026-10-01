<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Client extends Model
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'agency_id', 'first_name', 'last_name', 'phone', 'phone_secondary', 'email', 'address', 'city',
        'contact_preference', 'referral_code', 'loyalty_points', 'notes', 'is_active', 'sms_consent', 'email_consent',
    ];

    protected $appends = ['loyalty_discount_rate', 'loyalty_tier_name'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sms_consent' => 'boolean',
            'email_consent' => 'boolean',
        ];
    }

    /** Le palier le plus élevé atteint par le nombre de points actuel du client, s'il y en a un. */
    public function currentLoyaltyTier(): ?LoyaltyTier
    {
        return LoyaltyTier::query()
            ->where('is_active', true)
            ->where('min_points', '<=', $this->loyalty_points)
            ->orderByDesc('min_points')
            ->first();
    }

    protected function loyaltyDiscountRate(): Attribute
    {
        return Attribute::get(fn () => $this->currentLoyaltyTier()?->discount_rate ?? 0.0);
    }

    protected function loyaltyTierName(): Attribute
    {
        return Attribute::get(fn () => $this->currentLoyaltyTier()?->name);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(CustomerSubscription::class);
    }
}
