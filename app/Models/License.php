<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class License extends Model
{
    protected $fillable = ['plan', 'starts_at', 'expires_at', 'grace_period_days', 'status'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LicensePayment::class);
    }

    /**
     * Licence courante du déploiement (modèle mono-client : une seule ligne "active").
     */
    public static function current(): ?self
    {
        return static::orderByDesc('expires_at')->first();
    }

    /**
     * Statut recalculé à partir de l'horloge, indépendamment de la colonne `status`
     * stockée (qui peut être obsolète tant que `refreshStatus()` n'a pas tourné).
     */
    public function computeStatus(): string
    {
        $now = now();

        if ($now->lt($this->expires_at)) {
            return 'active';
        }

        if ($now->lt($this->graceEndsAt())) {
            return 'grace_period';
        }

        return 'expired';
    }

    public function graceEndsAt(): \Illuminate\Support\Carbon
    {
        return $this->expires_at->copy()->addDays($this->grace_period_days);
    }

    /**
     * Persiste le statut recalculé s'il a changé — appelé par le middleware à
     * chaque requête, ce qui suffit à faire basculer active -> grâce -> bloqué
     * sans tâche planifiée dédiée (les rappels par e-mail restent, eux, planifiés).
     */
    public function refreshStatus(): self
    {
        $computed = $this->computeStatus();
        if ($computed !== $this->status) {
            $this->status = $computed;
            $this->save();
        }

        return $this;
    }
}
