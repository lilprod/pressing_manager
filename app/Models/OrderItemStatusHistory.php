<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItemStatusHistory extends Model
{
    public $timestamps = false;

    protected $fillable = ['order_item_id', 'from_status', 'to_status', 'changed_by', 'notes', 'changed_at'];

    protected function casts(): array
    {
        return [
            'changed_at' => 'datetime',
        ];
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    // Nommé différemment de la colonne `changed_by` : voir le piège documenté dans
    // CLAUDE.md (une relation au même nom snake_case qu'une colonne FK écrase celle-ci
    // dans Model::toArray()). Jamais chargée ailleurs avant ce commit — renommage sûr.
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
