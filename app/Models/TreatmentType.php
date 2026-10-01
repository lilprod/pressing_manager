<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TreatmentType extends Model
{
    use HasFactory;

    protected $fillable = ['pressing_id', 'code', 'name', 'price_ratio', 'is_active'];

    protected function casts(): array
    {
        return [
            'price_ratio' => 'float',
            'is_active' => 'boolean',
        ];
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
