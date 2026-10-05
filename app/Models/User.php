<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $appends = ['photo_url', 'password_expired', 'password_expires_at'];

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
        return Agency::where('id', $agencyId)
            ->where('pressing_id', $this->pressing_id)
            ->when($this->agency_id !== null, fn ($q) => $q->where('id', $this->agency_id))
            ->exists();
    }
}
