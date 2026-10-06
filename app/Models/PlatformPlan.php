<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlatformPlan extends Model
{
    protected $fillable = [
        'slug', 'name', 'is_active', 'price', 'currency', 'duration_days',
        'agencies_limit', 'users_limit', 'storage_limit_gb',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'price' => 'integer',
            'duration_days' => 'integer',
            'agencies_limit' => 'integer',
            'users_limit' => 'integer',
            'storage_limit_gb' => 'integer',
        ];
    }

    public function pressings(): HasMany
    {
        return $this->hasMany(Pressing::class);
    }
}
