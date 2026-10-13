<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    private const MAX_FAILED_LOGIN_ATTEMPTS = 5;

    private const LOCKOUT_MINUTES = 15;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'photo_path',
        'password',
        'role_id',
        'agency_id',
        'pressing_id',
        'is_active',
        'must_change_password',
        'password_changed_at',
        'first_name',
        'last_name',
        'job_title',
        'employee_number',
        'timezone',
        'preferences',
        'mfa_required',
        'invitation_expires_at',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'mfa_secret',
        'mfa_recovery_codes',
    ];

    protected $appends = ['photo_url', 'password_expired', 'password_expires_at', 'mfa_enabled'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'password_changed_at' => 'datetime',
            'locked_until' => 'datetime',
            'preferences' => 'array',
            'mfa_secret' => 'encrypted',
            'mfa_recovery_codes' => 'encrypted:array',
            'mfa_enabled_at' => 'datetime',
            'mfa_required' => 'boolean',
            'invitation_expires_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    public function registerFailedLogin(): void
    {
        $this->increment('failed_login_attempts');

        if ($this->failed_login_attempts >= self::MAX_FAILED_LOGIN_ATTEMPTS) {
            $this->forceFill(['locked_until' => now()->addMinutes(self::LOCKOUT_MINUTES)])->save();
        }
    }

    public function registerSuccessfulLogin(): void
    {
        $this->forceFill([
            'failed_login_attempts' => 0,
            'locked_until' => null,
        ])->save();
    }

    /** @return list<string> codes de secours en clair, affichés une seule fois */
    public function regenerateRecoveryCodes(): array
    {
        $plain = [];
        $stored = [];
        foreach (range(1, 8) as $i) {
            $code = \Illuminate\Support\Str::upper(\Illuminate\Support\Str::random(10));
            $plain[] = $code;
            $stored[] = ['hash' => hash('sha256', $code), 'used_at' => null];
        }
        $this->forceFill(['mfa_recovery_codes' => $stored])->save();

        return $plain;
    }

    public function consumeRecoveryCode(string $code): bool
    {
        $codes = $this->mfa_recovery_codes ?? [];
        foreach ($codes as $index => $entry) {
            if ($entry['used_at'] === null && hash_equals($entry['hash'], hash('sha256', strtoupper($code)))) {
                $codes[$index]['used_at'] = now()->toIso8601String();
                $this->forceFill(['mfa_recovery_codes' => $codes])->save();

                return true;
            }
        }

        return false;
    }

    public function remainingRecoveryCodes(): int
    {
        return collect($this->mfa_recovery_codes ?? [])->whereNull('used_at')->count();
    }

    protected function mfaEnabled(): Attribute
    {
        return Attribute::get(fn () => $this->mfa_enabled_at !== null);
    }

    /** Agences complémentaires (en plus de l'agence principale `agency_id`). */
    public function extraAgencies(): BelongsToMany
    {
        return $this->belongsToMany(Agency::class, 'agency_user');
    }

    public function authorizedDevices(): HasMany
    {
        return $this->hasMany(AuthorizedDevice::class);
    }

    /**
     * Agences explicitement accessibles d'un compte local (principale + affectations
     * complémentaires). `null` pour un compte global (toutes les agences du pressing).
     *
     * @return array<int>|null
     */
    public function accessibleAgencyIds(): ?array
    {
        if ($this->agency_id === null) {
            return null;
        }

        $extra = $this->relationLoaded('extraAgencies')
            ? $this->extraAgencies->pluck('id')->all()
            : $this->extraAgencies()->pluck('agencies.id')->all();

        return array_values(array_unique([$this->agency_id, ...array_map('intval', $extra)]));
    }

    /**
     * Agence effective d'une opération à agence unique : pour un compte global,
     * l'agence demandée ; pour un compte local, l'agence demandée si elle fait partie
     * de ses affectations, sinon son agence principale (comportement historique).
     */
    public function effectiveAgencyId(?int $requested): ?int
    {
        if ($this->agency_id === null) {
            return $requested;
        }

        return $requested !== null && in_array($requested, $this->accessibleAgencyIds(), true) ? $requested : $this->agency_id;
    }

    protected function photoUrl(): Attribute
    {
        return Attribute::get(fn () => $this->photo_path !== null ? url("/api/users/{$this->id}/photo") : null);
    }

    /** true si la politique d'expiration est activée et que le mot de passe n'a pas été changé depuis. */
    protected function passwordExpired(): Attribute
    {
        return Attribute::get(function () {
            // pressing_id/password_changed_at absents : modèle chargé avec un select()
            // partiel (ex. annuaire allégé UserController::index) — rien à calculer.
            if ($this->password_changed_at === null || $this->pressing_id === null) {
                return false;
            }

            $days = AppSetting::current($this->pressing_id)->password_expiry_days;
            if (! $days) {
                return false;
            }

            return $this->password_changed_at->addDays($days)->isPast();
        });
    }

    /** Date d'expiration calculée du mot de passe, si la politique d'expiration est activée. */
    protected function passwordExpiresAt(): Attribute
    {
        return Attribute::get(function () {
            if ($this->password_changed_at === null || $this->pressing_id === null) {
                return null;
            }

            $days = AppSetting::current($this->pressing_id)->password_expiry_days;
            if (! $days) {
                return null;
            }

            return $this->password_changed_at->addDays($days);
        });
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Null pour les rôles à portée globale (admin, manager global).
     */
    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function pressing(): BelongsTo
    {
        return $this->belongsTo(Pressing::class);
    }

    public function hasRole(string ...$slugs): bool
    {
        return in_array($this->role?->slug, $slugs, true);
    }

    public function hasPermission(string $slug): bool
    {
        return $this->role !== null && $this->role->permissions->contains('slug', $slug);
    }

    /**
     * Un utilisateur sans agence (rôle global) accède à toutes les agences — mais
     * seulement celles de SON pressing (pivot multi-tenant, voir CLAUDE.md) : avant
     * cette passe, `agency_id === null` donnait accès à toute la table `agencies`,
     * ce qui exposait les autres pressings dès qu'ils ont partagé la même base.
     */
    public function canAccessAgency(int $agencyId): bool
    {
        $allowed = $this->accessibleAgencyIds();
        if ($allowed !== null && ! in_array($agencyId, $allowed, true)) {
            return false;
        }

        return Agency::where('id', $agencyId)->where('pressing_id', $this->pressing_id)->exists();
    }
}
