<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LoyaltyTier extends Model
{
    use HasFactory;

    protected $fillable = ['pressing_id', 'name', 'min_spend_amount', 'discount_rate', 'point_multiplier', 'benefit_description', 'is_active'];

    protected function casts(): array
    {
        return [
            'min_spend_amount' => 'integer',
            'discount_rate' => 'float',
            'point_multiplier' => 'float',
            'is_active' => 'boolean',
        ];
    }
}
