<?php

namespace App\Http\Controllers\Api\Platform;

use App\Models\PlatformAuditLog;
use App\Models\PlatformUser;
use App\Models\Pressing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phase 3 (observabilité) — écran « Audit global » jusqu'ici absent malgré un
 * mécanisme de journalisation déjà en place et déjà alimenté depuis la Phase 1
 * (`PlatformAuditLog`/`PlatformAuditable`). Mirrors `AuditLogController` tenant.
 */
class PlatformAuditLogController extends PlatformApiController
{
    private const TYPES = [
        'pressing' => Pressing::class,
        'platform_user' => PlatformUser::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');

        $query = PlatformAuditLog::query()->with('platformUser')->latest('created_at');

        if ($type = $request->string('type')->toString()) {
            if (! array_key_exists($type, self::TYPES)) {
                return response()->json(['message' => 'Type inconnu.'], 422);
            }
            $query->where('auditable_type', self::TYPES[$type]);
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->date('from'));
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->date('to')->endOfDay());
        }

        // Un non-superadmin ne voit que l'activité des pressings qui lui sont affectés
        // (même discipline que le reste du RBAC transverse) — jamais les entrées
        // relatives à d'autres membres du personnel Spark, réservées au superadmin.
        if (! $user->isSuperadmin()) {
            $pressingIds = $this->resolvePressingFilter($user) ?? [];
            $query->where('auditable_type', Pressing::class)->whereIn('auditable_id', $pressingIds);
        }

        return response()->json($query->paginate($request->integer('per_page', 25)));
    }
}
