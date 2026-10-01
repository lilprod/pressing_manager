<?php

namespace App\Services;

use App\Models\Agency;
use App\Models\AuditLog;
use App\Models\Attendance;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderPickup;
use App\Models\Payment;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Agrégats réseau pour la Vue consolidée multi-agences. N'assemble que des données réellement
 * stockées (paiements, dépôts, retraits, factures, mouvements de caisse, pointages, audit) —
 * aucun objectif/cible n'existe en base (pas de table de quotas), donc aucun "objectif réseau"
 * ou "objectif mensuel" n'est calculé ici : ces éléments de la maquette restent omis (voir
 * CLAUDE.md). Même principe pour un statut de connexion "en ligne" par agence : seul le champ
 * réel `is_active` est exposé.
 */
class MultiAgencyService
{
    private const LATE_STATUSES_EXCLUDED = ['pret', 'livre', 'annule'];

    /** Seuil (FCFA) au-delà duquel un impayé d'agence déclenche une alerte opérationnelle. */
    private const UNPAID_ALERT_THRESHOLD = 50_000;

    /**
     * Vue réseau : une ligne par agence (toutes si $agencyId est null, sinon la seule agence
     * résolue pour un utilisateur local) + les totaux réseau, le classement, la série
     * quotidienne de CA et les alertes opérationnelles dérivées des mêmes données.
     */
    public function overview(Carbon $from, Carbon $to, ?int $agencyId): array
    {
        $agencies = Agency::query()
            ->when($agencyId, fn ($q) => $q->where('id', $agencyId))
            ->orderBy('name')
            ->get();

        $rows = $this->agencyRows($agencies, $from, $to);
        $ranked = $rows->sortByDesc('revenue')->values();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'network' => [
                'revenue' => (int) $rows->sum('revenue'),
                'deposits' => (int) $rows->sum('deposits'),
                'pickups' => (int) $rows->sum('pickups'),
                'cash_flow_net' => (int) $rows->sum('cash_flow_net'),
                'outstanding' => (int) $rows->sum('outstanding'),
                'loyalty_members' => (int) $rows->sum('loyalty_members'),
            ],
            'agencies' => $ranked->values()->all(),
            'revenue_series' => $this->revenueSeries($from, $to, $agencyId),
            'alerts' => $this->buildAlerts($rows),
        ];
    }

    /**
     * Détail d'une agence : ses propres chiffres + (si $includeNetworkComparison, réservé à un
     * utilisateur global) son rang et sa comparaison aux moyennes réseau. Un utilisateur
     * d'agence n'obtient jamais les agrégats des autres agences, même pour une comparaison.
     */
    public function agencyDetail(Agency $agency, Carbon $from, Carbon $to, bool $includeNetworkComparison): array
    {
        $allAgencies = $includeNetworkComparison ? Agency::query()->orderBy('name')->get() : collect([$agency]);
        $rows = $this->agencyRows($allAgencies, $from, $to);
        $mine = $rows->firstWhere('id', $agency->id);

        $networkComparison = null;
        if ($includeNetworkComparison && $rows->count() > 0) {
            $ranked = $rows->sortByDesc('revenue')->values();
            $rank = $ranked->search(fn ($r) => $r['id'] === $agency->id);
            $networkComparison = [
                'rank' => $rank === false ? null : $rank + 1,
                'agency_count' => $rows->count(),
                'avg_revenue' => (int) round($rows->avg('revenue')),
                'avg_outstanding' => (int) round($rows->avg('outstanding')),
                'avg_late_orders' => round($rows->avg('late_orders'), 1),
                'avg_basket' => (int) round($rows->avg('average_basket')),
            ];
        }

        return [
            'agency' => [
                'id' => $agency->id,
                'code' => $agency->code,
                'name' => $agency->name,
                'city' => $agency->city,
                'address' => $agency->address,
                'phone' => $agency->phone,
                'is_active' => $agency->is_active,
            ],
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'kpis' => $mine,
            'network_comparison' => $networkComparison,
            'revenue_series' => $this->revenueSeries($from, $to, $agency->id),
            'workshop' => $this->workshopBreakdown($agency),
            'clients' => $this->clientSummary($agency, $from, $to),
            'team_present' => $this->teamPresent($agency),
            'recent_activity' => $this->recentActivity($agency),
        ];
    }

    /** @return Collection<int, array<string, mixed>> une ligne par agence. */
    private function agencyRows(Collection $agencies, Carbon $from, Carbon $to): Collection
    {
        $agencyIds = $agencies->pluck('id');
        if ($agencyIds->isEmpty()) {
            return collect();
        }

        $revenueByAgency = Payment::query()
            ->where('status', 'complete')
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw('agency_id, sum(amount) as total')
            ->groupBy('agency_id')
            ->pluck('total', 'agency_id');

        $depositsByAgency = Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('agency_id, count(*) as total, avg(total_amount) as avg_basket')
            ->groupBy('agency_id')
            ->get()
            ->keyBy('agency_id');

        $pickupsByAgency = OrderPickup::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('processed_at', [$from, $to])
            ->selectRaw('agency_id, count(*) as total')
            ->groupBy('agency_id')
            ->pluck('total', 'agency_id');

        $cashInByAgency = CashMovement::query()
            ->where('status', 'valide')->where('type', 'entree')
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('occurred_at', [$from, $to])
            ->selectRaw('agency_id, sum(amount) as total')->groupBy('agency_id')->pluck('total', 'agency_id');

        $cashOutByAgency = CashMovement::query()
            ->where('status', 'valide')->where('type', 'sortie')
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('occurred_at', [$from, $to])
            ->selectRaw('agency_id, sum(amount) as total')->groupBy('agency_id')->pluck('total', 'agency_id');

        $outstandingByAgency = Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->whereIn('agency_id', $agencyIds)
            ->withSum(['payments as paid_amount' => fn ($q) => $q->where('status', 'complete')], 'amount')
            ->get()
            ->groupBy('agency_id')
            ->map(fn ($invoices) => [
                'amount' => $invoices->sum(fn (Invoice $i) => max(0, $i->total_amount - (int) ($i->paid_amount ?? 0))),
                'clients' => $invoices->pluck('client_id')->unique()->count(),
            ]);

        $lateByAgency = Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereNotNull('promised_at')
            ->where('promised_at', '<', now())
            ->whereNotIn('status', self::LATE_STATUSES_EXCLUDED)
            ->selectRaw('agency_id, count(*) as total')
            ->groupBy('agency_id')
            ->pluck('total', 'agency_id');

        $loyaltyByAgency = Client::query()
            ->whereIn('agency_id', $agencyIds)
            ->where('loyalty_points', '>', 0)
            ->selectRaw('agency_id, count(*) as members, sum(loyalty_points) as points')
            ->groupBy('agency_id')
            ->get()
            ->keyBy('agency_id');

        $activeByAgencyStatus = Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereIn('status', AtelierBoardService::ACTIVE_STATUSES)
            ->selectRaw('agency_id, status, count(*) as total')
            ->groupBy('agency_id', 'status')
            ->get()
            ->groupBy('agency_id');

        return $agencies->map(function (Agency $agency) use (
            $revenueByAgency, $depositsByAgency, $pickupsByAgency, $cashInByAgency, $cashOutByAgency,
            $outstandingByAgency, $lateByAgency, $loyaltyByAgency, $activeByAgencyStatus,
        ) {
            $revenue = (int) ($revenueByAgency[$agency->id] ?? 0);
            $deposit = $depositsByAgency->get($agency->id);
            $deposits = (int) ($deposit->total ?? 0);
            $averageBasket = (int) round($deposit->avg_basket ?? 0);
            $cashIn = (int) ($cashInByAgency[$agency->id] ?? 0);
            $cashOut = (int) ($cashOutByAgency[$agency->id] ?? 0);
            $outstanding = $outstandingByAgency->get($agency->id);
            $loyalty = $loyaltyByAgency->get($agency->id);
            $activeStatuses = $activeByAgencyStatus->get($agency->id, collect());
            $activeCount = (int) $activeStatuses->sum('total');

            return [
                'id' => $agency->id,
                'name' => $agency->name,
                'code' => $agency->code,
                'is_active' => $agency->is_active,
                'revenue' => $revenue,
                'deposits' => $deposits,
                'average_basket' => $averageBasket,
                'pickups' => (int) ($pickupsByAgency[$agency->id] ?? 0),
                'cash_flow_net' => $revenue + $cashIn - $cashOut,
                'outstanding' => (int) ($outstanding['amount'] ?? 0),
                'unpaid_clients' => (int) ($outstanding['clients'] ?? 0),
                'late_orders' => (int) ($lateByAgency[$agency->id] ?? 0),
                'loyalty_members' => (int) ($loyalty->members ?? 0),
                'loyalty_points' => (int) ($loyalty->points ?? 0),
                'workshop_active_count' => $activeCount,
                'workshop_capacity' => $agency->workshop_capacity ?? config('atelier.default_capacity'),
            ];
        });
    }

    /** Série quotidienne du CA (somme des paiements complets par jour), jours sans paiement inclus à 0. */
    private function revenueSeries(Carbon $from, Carbon $to, ?int $agencyId): array
    {
        $rows = Payment::query()
            ->where('status', 'complete')
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw('DATE(paid_at) as day, sum(amount) as total')
            ->groupBy('day')
            ->get()
            ->keyBy(fn ($r) => (string) $r->day);

        $series = [];
        $cursor = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();
        $guard = 0;
        while ($cursor->lte($end) && $guard < 366) {
            $key = $cursor->toDateString();
            $series[] = ['date' => $key, 'revenue' => (int) ($rows[$key]->total ?? 0)];
            $cursor->addDay();
            $guard++;
        }

        return $series;
    }

    /** Alertes opérationnelles dérivées des mêmes agrégats (retards, impayés significatifs, atelier saturé) — aucune ne dépend d'un objectif ou d'un indicateur fabriqué. */
    private function buildAlerts(Collection $rows): array
    {
        $alerts = [];
        foreach ($rows as $row) {
            if ($row['late_orders'] > 0) {
                $alerts[] = ['agency_id' => $row['id'], 'agency_name' => $row['name'], 'kind' => 'late', 'count' => $row['late_orders']];
            }
            if ($row['outstanding'] >= self::UNPAID_ALERT_THRESHOLD) {
                $alerts[] = [
                    'agency_id' => $row['id'], 'agency_name' => $row['name'], 'kind' => 'unpaid',
                    'amount' => $row['outstanding'], 'count' => $row['unpaid_clients'],
                ];
            }
            if ($row['workshop_capacity'] > 0 && $row['workshop_active_count'] > $row['workshop_capacity']) {
                $alerts[] = [
                    'agency_id' => $row['id'], 'agency_name' => $row['name'], 'kind' => 'workshop_over_capacity',
                    'active_count' => $row['workshop_active_count'], 'capacity' => $row['workshop_capacity'],
                ];
            }
        }

        return $alerts;
    }

    /** @return array{columns: array<string,int>, capacity: int, active_count: int} */
    private function workshopBreakdown(Agency $agency): array
    {
        $statusCounts = Order::query()
            ->where('agency_id', $agency->id)
            ->whereIn('status', AtelierBoardService::ACTIVE_STATUSES)
            ->selectRaw('status, count(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $columns = ['attente' => 0, 'cours' => 0, 'traites' => 0, 'classes' => 0];
        foreach ($statusCounts as $status => $count) {
            $column = AtelierBoardService::columnFor($status);
            if ($column !== null) {
                $columns[$column] += (int) $count;
            }
        }

        return [
            'columns' => $columns,
            'capacity' => $agency->workshop_capacity ?? config('atelier.default_capacity'),
            'active_count' => array_sum($columns),
        ];
    }

    private function clientSummary(Agency $agency, Carbon $from, Carbon $to): array
    {
        return [
            'active' => Client::where('agency_id', $agency->id)->where('is_active', true)->count(),
            'new_this_period' => Client::where('agency_id', $agency->id)->whereBetween('created_at', [$from, $to])->count(),
        ];
    }

    /** Personnel actuellement pointé (clock_in posé, clock_out non posé) aujourd'hui pour cette agence. */
    private function teamPresent(Agency $agency): array
    {
        return Attendance::query()
            ->where('agency_id', $agency->id)
            ->whereDate('clock_in', now()->toDateString())
            ->whereNotNull('clock_in')
            ->whereNull('clock_out')
            ->with('user:id,name')
            ->get()
            ->map(fn (Attendance $a) => [
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'clock_in' => $a->clock_in,
            ])
            ->values()
            ->all();
    }

    /** Les 5 dernières entrées du journal d'audit générique pour cette agence (même forme que AuditLogController::decorate). */
    private function recentActivity(Agency $agency): array
    {
        return AuditLog::query()
            ->where('agency_id', $agency->id)
            ->with('user')
            ->latest('created_at')
            ->limit(5)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'auditable_type' => class_basename($log->auditable_type),
                'auditable_id' => $log->auditable_id,
                'old_values' => $log->old_values,
                'new_values' => $log->new_values,
                'user' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
                'created_at' => $log->created_at,
            ])
            ->values()
            ->all();
    }
}
