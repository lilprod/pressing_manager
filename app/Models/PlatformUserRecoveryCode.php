<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlatformUserRecoveryCode extends Model
{
    protected $fillable = ['platform_user_id', 'code_hash', 'used_at'];

    protected function casts(): array
    {
        return [
            'used_at' => 'datetime',
        ];
    }

    public function platformUser(): BelongsTo
    {
        return $this->belongsTo(PlatformUser::class);
    }
}
