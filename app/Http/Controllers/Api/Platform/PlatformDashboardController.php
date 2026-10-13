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

        $incidents = fn () => \App\Models\PlatformIncident::query()->where('status', 'open')
            ->when($pressingIds !== null, fn ($q) => $q->whereIn('pressing_id', $pressingIds));

        $counts = $scope()->where('status', 'active')->withCount([
            'agencies as live_agencies' => fn ($q) => $q->where('is_active', true),
            'users as live_users' => fn ($q) => $q->where('is_active', true),
        ])->get(['id', 'agencies_count', 'users_count']);

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
            // Pressing hébergé sur ce déploiement : comptes réels (base partagée depuis le
            // pivot multi-tenant). Pressing déployé ailleurs (aucune agence ici) : dernier
            // compte reçu par rapport périodique. Jamais l'un à la place de l'autre.
            'agences_total' => $counts->sum(fn ($p) => $p->live_agencies > 0 ? $p->live_agencies : $p->agencies_count),
            'utilisateurs_total' => $counts->sum(fn ($p) => $p->live_agencies > 0 ? $p->live_users : $p->users_count),
            'incidents' => [
                'open' => $incidents()->count(),
                'high_priority' => $incidents()->whereIn('priority', ['P1', 'P2'])->count(),
                'recent' => $incidents()->with('pressing:id,name')->orderBy('priority')->latest()->limit(3)->get(['id', 'pressing_id', 'title', 'priority', 'created_at']),
            ],
            'tenants_new_this_quarter' => $scope()->where('created_at', '>=', now()->firstOfQuarter())->count(),
            'countries' => $scope()->where('status', 'active')->whereNotNull('country_code')->distinct()->count('country_code'),
            'users_active_today' => \App\Models\User::query()->whereIn('pressing_id', $counts->pluck('id'))->whereDate('last_login_at', today())->count(),
            'license_health' => [
                'total' => $totalPressings,
                'active' => $activePressings,
                'renewal_due' => $renewalDuePressings,
                'suspended' => $suspendedPressings,
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
