<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\Request;

/**
 * Journal append-only des connexions et évènements de sécurité du personnel tenant
 * (connexion, échec, verrouillage, déconnexion, mot de passe, MFA, sessions, appareils,
 * invitations, affectations). Alimente « Dernière connexion », « Activité récente » et
 * « Connexions aujourd'hui » des écrans Équipe et Profil.
 */
class AuthEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['pressing_id', 'user_id', 'actor_id', 'type', 'ip_address', 'user_agent', 'meta', 'created_at'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'created_at' => 'datetime'];
    }

    public static function record(string $type, ?User $user, ?Request $request = null, array $meta = [], ?User $actor = null): self
    {
        return static::create([
            'pressing_id' => $user?->pressing_id ?? $actor?->pressing_id,
            'user_id' => $user?->id,
            'actor_id' => $actor?->id,
            'type' => $type,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? substr((string) $request->userAgent(), 0, 500) : null,
            'meta' => $meta ?: null,
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
