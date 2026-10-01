<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashClosureCount extends Model
{
    protected $fillable = ['cash_closure_id', 'method', 'theoretical_amount', 'counted_amount', 'variance'];

    public function closure(): BelongsTo
    {
        return $this->belongsTo(CashClosure::class, 'cash_closure_id');
    }
}
