<?php

namespace App\Http\Controllers\Api\Platform;

use App\Models\Pressing;
use App\Models\PressingReportLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Agrégats réels uniquement — aucune télémétrie (santé technique, disponibilité, latence,
 * incidents) n'est fabriquée ici faute de pipeline réel. Voir CLAUDE.md pour le détail de
 * ce qui est volontairement omis. Restreint aux pressings affectés pour un utilisateur
 * non-superadmin (un auditeur transverse ne voit jamais les agrégats du réseau complet).
 */
class PlatformDashboardController extends PlatformApiController
{
    private const ACTIVITY_WINDOW_DAYS = 14;

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $pressingIds = $this->resolvePressingFilter($user);

        $scope = fn () => Pressing::query()->when($pressingIds !== null, fn ($q) => $q->whereIn('id', $pressingIds));

        $totalPressings = $scope()->count();
        $activePressings = $scope()->where('status', 'active')->count();
        $suspendedPressings = $scope()->where('status', 'suspended')->count();
        $renewalDuePressings = $scope()
            ->whereNotNull('license_expires_at')
            ->where('license_expires_at', '>', now())
            ->where('license_expires_at', '<=', now()->addDays(30))
            ->count();

        return response()->json([
            'tenants_actifs' => $activePressings,
            'agences_total' => (int) $scope()->where('status', 'active')->sum('agencies_count'),
            'utilisateurs_total' => (int) $scope()->where('status', 'active')->sum('users_count'),
            'license_health' => [
                'total' => $totalPressings,
                'active_pct' => $this->percentage($activePressings, $totalPressings),
                'renewal_due_pct' => $this->percentage($renewalDuePressings, $totalPressings),
                'suspended_pct' => $this->percentage($suspendedPressings, $totalPressings),
            ],
            'activity_series' => $this->activitySeries($pressingIds),
        ]);
    }

    private function percentage(int $count, int $total): float
    {
        return $total > 0 ? round(($count / $total) * 100, 1) : 0.0;
    }

    /** Série des 14 derniers jours, jours sans rapport remplis à 0 (pas d'interpolation). */
    private function activitySeries(?array $pressingIds): array
    {
        $since = now()->subDays(self::ACTIVITY_WINDOW_DAYS - 1)->startOfDay();

        $byDay = PressingReportLog::where('created_at', '>=', $since)
            ->when($pressingIds !== null, fn ($q) => $q->whereIn('pressing_id', $pressingIds))
            ->select(DB::raw('date(created_at) as day'), DB::raw('SUM(operations_count) as total'))
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];
        for ($i = self::ACTIVITY_WINDOW_DAYS - 1; $i >= 0; $i--) {
            $date = now()->subDays($i)->toDateString();
            $series[] = ['date' => $date, 'operations_count' => (int) ($byDay[$date] ?? 0)];
        }

        return $series;
    }
}
