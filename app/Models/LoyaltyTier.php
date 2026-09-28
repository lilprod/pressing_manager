<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LoyaltyTier extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'min_points', 'discount_rate', 'is_active'];

    protected function casts(): array
    {
        return [
            'min_points' => 'integer',
            'discount_rate' => 'float',
            'is_active' => 'boolean',
        ];
    }
}
