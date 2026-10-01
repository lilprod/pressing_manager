<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Personnel Spark (console superadmin de la plateforme) — royaume d'authentification
 * séparé des `users` tenant, voir config/auth.php (guard `platform`, provider
 * `platform_users`). Verrouillage après 5 échecs, 15 minutes — texte exact de la maquette.
 */
class PlatformUser extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    private const MAX_FAILED_ATTEMPTS = 5;

    private const LOCKOUT_MINUTES = 15;

    protected $fillable = ['name', 'email', 'password', 'is_active', 'totp_secret', 'totp_enabled_at'];

    protected $hidden = ['password', 'totp_secret', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'totp_secret' => 'encrypted',
            'totp_enabled_at' => 'datetime',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function recoveryCodes(): HasMany
    {
        return $this->hasMany(PlatformUserRecoveryCode::class);
    }

    public function hasMfaEnabled(): bool
    {
        return $this->totp_enabled_at !== null;
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    public function registerFailedLogin(): void
    {
        $this->increment('failed_login_attempts');

        if ($this->failed_login_attempts >= self::MAX_FAILED_ATTEMPTS) {
            $this->forceFill(['locked_until' => now()->addMinutes(self::LOCKOUT_MINUTES)])->save();
        }
    }

    public function registerSuccessfulLogin(): void
    {
        $this->forceFill([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
        ])->save();
    }
}
