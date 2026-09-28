<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class IntakeCondition extends Model
{
    protected $fillable = ['code', 'label', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function orderItems(): BelongsToMany
    {
        return $this->belongsToMany(OrderItem::class, 'order_item_intake_condition');
    }
}
