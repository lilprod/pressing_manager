<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Agency extends Model
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'pressing_id', 'code', 'name', 'city', 'address', 'phone',
        'unclaimed_item_threshold_days', 'is_active', 'workshop_capacity',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function pressing(): BelongsTo
    {
        return $this->belongsTo(Pressing::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function clients(): HasMany
    {
        return $this->hasMany(Client::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'agency_services')
            ->withPivot(['price_override', 'is_active']);
    }

    /** Une agence s'audite elle-même (pas de colonne agency_id distincte à chercher). */
    protected function auditAgencyId(): ?int
    {
        return $this->id;
    }

    public function settings(): HasOne
    {
        return $this->hasOne(AgencySetting::class);
    }

    /**
     * Préfixe/suffixe/padding configurés (« Codes dépôt ») — couche d'affichage
     * uniquement, ne change jamais `order_number`/`invoice_number` eux-mêmes (entiers
     * bruts, toujours utilisés pour le verrouillage de séquence dans
     * OrderNumberGenerator/InvoiceService).
     */
    public function formatOrderNumber(int $number): string
    {
        $settings = $this->relationLoaded('settings') ? $this->settings : AgencySetting::forAgency($this->id);
        $padded = str_pad((string) $number, $settings?->order_number_padding ?? 4, '0', STR_PAD_LEFT);

        return ($settings?->order_number_prefix ?? '').$padded.($settings?->order_number_suffix ?? '');
    }
}
