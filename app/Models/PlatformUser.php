<?php

namespace App\Models;

use App\Models\Concerns\PlatformAuditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

/**
 * Personnel Spark (console superadmin de la plateforme) — royaume d'authentification
 * séparé des `users` tenant, voir config/auth.php (guard `platform`, provider
 * `platform_users`). Verrouillage après 5 échecs, 15 minutes — texte exact de la maquette.
 */
class PlatformUser extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, PlatformAuditable;

    private const MAX_FAILED_ATTEMPTS = 5;

    private const LOCKOUT_MINUTES = 15;

    protected $fillable = [
        'name', 'email', 'password', 'is_active', 'totp_secret', 'totp_enabled_at', 'platform_role_id',
        'photo_path', 'phone', 'must_change_password',
    ];

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
            'must_change_password' => 'boolean',
        ];
    }

    public function recoveryCodes(): HasMany
    {
        return $this->hasMany(PlatformUserRecoveryCode::class);
    }

    public function platformRole(): BelongsTo
    {
        return $this->belongsTo(PlatformRole::class);
    }

    public function pressings(): BelongsToMany
    {
        return $this->belongsToMany(Pressing::class, 'pressing_platform_user');
    }

    public function hasPermission(string $slug): bool
    {
        return $this->platformRole !== null && $this->platformRole->permissions->contains('slug', $slug);
    }

    public function isSuperadmin(): bool
    {
        return $this->platformRole?->isSuperadmin() ?? false;
    }

    /** Un superadmin accède à tous les pressings, indépendamment des affectations. */
    public function canAccessPressing(int $pressingId): bool
    {
        return $this->isSuperadmin() || $this->pressings()->where('pressings.id', $pressingId)->exists();
    }

    public function hasMfaEnabled(): bool
    {
        return $this->totp_enabled_at !== null;
    }

    public function consumeRecoveryCode(string $code): bool
    {
        $match = $this->recoveryCodes()->whereNull('used_at')->where('code_hash', hash('sha256', $code))->first();

        if ($match === null) {
            return false;
        }

        $match->forceFill(['used_at' => now()])->save();

        return true;
    }

    /** @return list<string> codes en clair, affichés une seule fois à l'appelant */
    public function regenerateRecoveryCodes(): array
    {
        $this->recoveryCodes()->delete();

        $plainCodes = [];
        foreach (range(1, 8) as $i) {
            $plain = Str::upper(Str::random(10));
            $plainCodes[] = $plain;

            PlatformUserRecoveryCode::create([
                'platform_user_id' => $this->id,
                'code_hash' => hash('sha256', $plain),
            ]);
        }

        return $plainCodes;
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
