<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class License extends Model
{
    protected $fillable = ['plan', 'starts_at', 'expires_at', 'grace_period_days', 'status'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LicensePayment::class);
    }
}
