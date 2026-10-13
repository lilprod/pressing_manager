<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Appareil de confiance : dispense du second facteur tant qu'il est valide et non révoqué. */
class AuthorizedDevice extends Model
{
    protected $fillable = ['user_id', 'label', 'token_hash', 'user_agent', 'ip_address', 'authorized_until', 'last_used_at', 'revoked_at'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['authorized_until' => 'datetime', 'last_used_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isValid(): bool
    {
        return $this->revoked_at === null && $this->authorized_until->isFuture();
    }
}
