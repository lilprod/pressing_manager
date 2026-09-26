<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LicensePayment extends Model
{
    protected $fillable = ['license_id', 'amount', 'method', 'external_reference', 'paid_at', 'new_expires_at'];

    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'new_expires_at' => 'datetime',
        ];
    }

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }
}
