<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServicePriceTier extends Model
{
    protected $fillable = ['service_id', 'weight_min', 'weight_max', 'price_per_kg'];

    protected function casts(): array
    {
        return [
            'weight_min' => 'float',
            'weight_max' => 'float',
        ];
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }
}
