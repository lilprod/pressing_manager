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

    protected $appends = ['photo_url', 'password_expired'];

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
        ];
    }

    protected function photoUrl(): Attribute
    {
        return Attribute::get(fn () => $this->photo_path !== null ? url("/api/users/{$this->id}/photo") : null);
    }

    /** true si la politique d'expiration est activée et que le mot de passe n'a pas été changé depuis. */
    protected function passwordExpired(): Attribute
    {
        return Attribute::get(function () {
            $days = AppSetting::current()->password_expiry_days;
            if (! $days || $this->password_changed_at === null) {
                return false;
            }

            return $this->password_changed_at->addDays($days)->isPast();
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

    public function hasRole(string ...$slugs): bool
    {
        return in_array($this->role?->slug, $slugs, true);
    }

    public function hasPermission(string $slug): bool
    {
        return $this->role !== null && $this->role->permissions->contains('slug', $slug);
    }

    /**
     * Un utilisateur sans agence (rôle global) accède à toutes les agences.
     */
    public function canAccessAgency(int $agencyId): bool
    {
        return $this->agency_id === null || $this->agency_id === $agencyId;
    }
}
