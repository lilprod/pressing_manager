<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * Journalise chaque création/modification/suppression dans `audit_logs`.
 * Le modèle doit exposer `agency_id` (ou une méthode `auditAgencyId()`) pour le rattachement.
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(fn ($model) => $model->recordAudit('created', null, $model->getAttributes()));

        static::updated(function ($model) {
            $changes = $model->getChanges();
            unset($changes['updated_at']);
            if ($changes !== []) {
                $model->recordAudit('updated', $model->only(array_keys($changes)) === [] ? null : $model->getOriginal(), $changes);
            }
        });

        static::deleted(fn ($model) => $model->recordAudit('deleted', $model->getAttributes(), null));
    }

    protected function recordAudit(string $action, ?array $old, ?array $new): void
    {
        AuditLog::query()->create([
            'agency_id' => $this->auditAgencyId(),
            // Guard explicite (pas Auth::id() nu) : une agence peut être créée par une
            // requête authentifiée côté plateforme (provisionnement superadmin, guard
            // `platform`, provider `platform_users`) — `platform_users.id` et `users.id`
            // sont des séquences indépendantes, écrire l'un dans la FK de l'autre casse
            // la contrainte (ou pire, désigne silencieusement le mauvais utilisateur
            // tenant). Le guard `sanctum` (provider `users`) est le seul pertinent ici ;
            // `null` si l'acteur n'est pas un utilisateur tenant (ex. provisionnement).
            'user_id' => Auth::guard('sanctum')->id(),
            'action' => static::class.'.'.$action,
            'auditable_type' => static::class,
            'auditable_id' => $this->getKey(),
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ]);
    }

    protected function auditAgencyId(): ?int
    {
        return $this->getAttribute('agency_id');
    }
}
