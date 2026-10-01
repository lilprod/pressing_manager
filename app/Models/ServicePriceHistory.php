<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServicePriceHistory extends Model
{
    public $timestamps = false;

    protected $fillable = ['service_id', 'field', 'old_value', 'new_value', 'changed_by', 'changed_at'];

    protected function casts(): array
    {
        return [
            'changed_at' => 'datetime',
        ];
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    // Nommée différemment de la colonne `changed_by` (voir le piège documenté dans
    // CLAUDE.md : relation au même nom snake_case qu'une colonne FK).
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
