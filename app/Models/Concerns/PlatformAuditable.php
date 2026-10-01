<?php

namespace App\Models\Concerns;

use App\Models\PlatformAuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * Copie du mécanisme `Auditable` (tenant), pour le royaume plateforme. Utilise
 * explicitement le guard `platform` — `Auth::id()` résoudrait le guard par défaut
 * (`web`), qui n'a aucun sens ici.
 */
trait PlatformAuditable
{
    public static function bootPlatformAuditable(): void
    {
        static::created(fn ($model) => $model->recordPlatformAudit('created', null, $model->getAttributes()));

        static::updated(function ($model) {
            $changes = $model->getChanges();
            unset($changes['updated_at']);
            if ($changes !== []) {
                $model->recordPlatformAudit('updated', $model->getOriginal(), $changes);
            }
        });

        static::deleted(fn ($model) => $model->recordPlatformAudit('deleted', $model->getAttributes(), null));
    }

    protected function recordPlatformAudit(string $action, ?array $old, ?array $new): void
    {
        PlatformAuditLog::query()->create([
            'platform_user_id' => Auth::guard('platform')->id(),
            'action' => static::class.'.'.$action,
            'auditable_type' => static::class,
            'auditable_id' => $this->getKey(),
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ]);
    }
}
