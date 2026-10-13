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
        'pressing_id', 'code', 'name', 'category', 'billing_mode', 'description', 'base_price', 'estimated_duration_hours',
        'priority', 'is_active', 'allow_discount', 'round_to_hundred', 'price_editable_at_counter',
        'home_delivery_enabled', 'draft_data', 'draft_saved_at', 'draft_saved_by',
    ];

    /** Le brouillon n'est exposé que sur la fiche d'édition (show), jamais au comptoir. */
    protected $hidden = ['draft_data'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'allow_discount' => 'boolean',
            'round_to_hundred' => 'boolean',
            'price_editable_at_counter' => 'boolean',
            'home_delivery_enabled' => 'boolean',
            'draft_data' => 'array',
            'draft_saved_at' => 'datetime',
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

    /** États du linge acceptés pour cet article (vide = tous). */
    public function acceptedConditions(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(IntakeCondition::class, 'service_intake_condition');
    }

    /** Prix/délai explicites par traitement (Classique, Express, Repassage…). */
    public function treatmentRates(): HasMany
    {
        return $this->hasMany(ServiceTreatmentPrice::class);
    }

    /** Rendus compatibles (vide = aucun rendu proposé au comptoir). */
    public function finishOptions(): BelongsToMany
    {
        return $this->belongsToMany(FinishOption::class, 'service_finish_option');
    }

    /** Autres articles du catalogue proposés en complément au comptoir. */
    public function associatedServices(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'service_associations', 'service_id', 'associated_service_id');
    }

    /** Nom distinct de la colonne draft_saved_by (piège Eloquent documenté). */
    public function draftSaver(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'draft_saved_by');
    }
}
