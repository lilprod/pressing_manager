<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Prix et délai explicites d'un article pour un traitement donné. Un prix nul
 * retombe sur le ratio du traitement appliqué au prix de base ; un délai nul
 * retombe sur le délai de l'article.
 */
class ServiceTreatmentPrice extends Model
{
    protected $fillable = ['service_id', 'treatment_type_id', 'price', 'delay_hours'];

    protected function casts(): array
    {
        return ['price' => 'integer', 'delay_hours' => 'integer'];
    }

    public function treatmentType(): BelongsTo
    {
        return $this->belongsTo(TreatmentType::class);
    }
}
