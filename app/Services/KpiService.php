<?php

namespace App\Services;

use App\Models\Agency;
use App\Models\AgencyStockItem;
use App\Models\Attendance;
use App\Models\Client;
use App\Models\CustomerSubscription;
use App\Models\Delivery;
use App\Models\LoyaltyPointMovement;
use App\Models\LoyaltyTier;
use App\Models\Order;
use App\Models\Payment;
use App\Models\StockItem;
use App\Models\StockMovement;
use Illuminate\Support\Carbon;

class KpiService
{
    private const GRANULARITIES = ['day', 'week', 'month'];

    /**
     * Série du CA encaissé (paiements complets) groupée par jour/semaine/mois —
     * trous comblés à 0, même principe que `MultiAgencyService::revenueSeries()`/
     * `CashService::flowSeries()` mais avec une granularité choisie plutôt que
     * toujours le jour. `date` est le premier jour de la période (semaine ISO
     * commençant lundi, mois calendaire).
     *
     * @param  array<int>  $agencyIds
     * @return array<int,array{date:string,revenue:int}>
     */
    public function revenueSeries(array $agencyIds, Carbon $from, Carbon $to, string $granularity): array
    {
        if (! in_array($granularity, self::GRANULARITIES, true)) {
            $granularity = 'day';
        }

        $rows = Payment::query()
            ->whereIn('agency_id', $agencyIds)
            ->where('status', 'complete')
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw("date_trunc('{$granularity}', paid_at) as period, sum(amount) as total")
            ->groupBy('period')
            ->get()
            ->keyBy(fn ($r) => Carbon::parse($r->period)->toDateString());

        $series = [];
        $cursor = $this->periodStart($from, $granularity);
        $end = $this->periodStart($to, $granularity);
        $guard = 0;
        while ($cursor->lte($end) && $guard < 366) {
            $key = $cursor->toDateString();
            $series[] = ['date' => $key, 'revenue' => (int) ($rows[$key]->total ?? 0)];
            $cursor = $this->advancePeriod($cursor, $granularity);
            $guard++;
        }

        return $series;
    }

    private function periodStart(Carbon $date, string $granularity): Carbon
    {
        return match ($granularity) {
            'week' => $date->copy()->startOfWeek(),
            'month' => $date->copy()->startOfMonth(),
            default => $date->copy()->startOfDay(),
        };
    }

    private function advancePeriod(Carbon $date, string $granularity): Carbon
    {
        return match ($granularity) {
            'week' => $date->copy()->addWeek(),
            'month' => $date->copy()->addMonthNoOverflow(),
            default => $date->copy()->addDay(),
        };
    }

    /**
     * agencyId null => vue consolidée multi-agences (totaux globaux + ventilation
     * par agence) ; agencyId fourni => vue d'une seule agence. `pressingAgencyIds`
     * borne toujours la vue consolidée aux agences du pressing de l'acteur (jamais
     * tout le déploiement — voir CLAUDE.md « Pivot multi-tenant »). `pressingId`
     * borne la lecture des paliers de fidélité au pressing de l'acteur (voir
     * `loyaltySummary()` — `loyalty_tiers` n'avait jamais reçu `pressing_id` lors
     * du pivot, correctif « Chantier D.1 »).
     *
     * @param  array<int>  $pressingAgencyIds
     */
    public function build(?int $agencyId, array $pressingAgencyIds, Carbon $from, Carbon $to, int $pressingId): array
    {
        $header = [
            'scope' => $agencyId ? 'agency' : 'consolidated',
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ];

        if ($agencyId) {
            $agency = Agency::find($agencyId);
            $scopeIds = [$agencyId];

            return $header
                + ['agency' => $agency ? ['id' => $agency->id, 'name' => $agency->name] : null]
                + $this->metrics($scopeIds, $from, $to)
                + ['payments_by_method' => $this->paymentsByMethod($scopeIds, $from, $to), 'loyalty' => $this->loyaltySummary($scopeIds, $from, $to, $pressingId)];
        }

        $byAgency = Agency::whereIn('id', $pressingAgencyIds)->orderBy('name')->get()
            ->map(fn (Agency $a) => ['agency_id' => $a->id, 'agency_name' => $a->name] + $this->metrics([$a->id], $from, $to))
            ->values()->all();

        return $header + $this->metrics($pressingAgencyIds, $from, $to) + [
            'by_agency' => $byAgency,
            'payments_by_method' => $this->paymentsByMethod($pressingAgencyIds, $from, $to),
            'loyalty' => $this->loyaltySummary($pressingAgencyIds, $from, $to, $pressingId),
        ];
    }

    /**
     * Ventilation des encaissements complets par moyen de paiement sur la période —
     * même granularité à 4 valeurs d'enum que `DailyReportService::paymentsByMethod()`
     * mais sur une plage de dates au lieu d'un seul jour (sémantique distincte,
     * pas de code dupliqué réutilisable tel quel : le filtre de date change de forme).
     *
     * @param  array<int>  $agencyIds
     * @return array<string,array{amount:int,percent:float}>
     */
    private function paymentsByMethod(array $agencyIds, Carbon $from, Carbon $to): array
    {
        $totals = Payment::query()
            ->whereIn('agency_id', $agencyIds)
            ->where('status', 'complete')
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw('method, sum(amount) as total')
            ->groupBy('method')
            ->pluck('total', 'method');

        $total = (int) $totals->sum();
        $percent = fn (int $amount): float => $total > 0 ? round($amount / $total * 100, 1) : 0.0;

        $byMethod = [];
        foreach (['espece', 'carte', 'flooz', 'tmoney'] as $method) {
            $amount = (int) ($totals[$method] ?? 0);
            $byMethod[$method] = ['amount' => $amount, 'percent' => $percent($amount)];
        }

        return $byMethod;
    }

    /**
     * Répartition réelle des clients par palier de fidélité (état courant, pas borné
     * à la période — un palier est un statut actuel, pas un évènement daté) + points
     * émis/consommés sur la période, depuis `loyalty_point_movements`.
     * **Points consommés toujours à 0 pour l'instant** : aucun mécanisme de
     * consommation de points n'existe dans l'app (voir CLAUDE.md « 09 Promotions et
     * fidélité ») — valeur réelle, pas masquée, juste honnêtement nulle tant que ce
     * mécanisme n'existe pas.
     *
     * @param  array<int>  $agencyIds
     * @return array{by_tier:array<int,array{id:int,name:string,count:int}>, points_issued:int, points_consumed:int}
     */
    /**
     * Rendu public (CLAUDE.md, audit « Promotions et fidélité ») : réutilisé tel quel
     * par `LoyaltyTierController::stats()` pour l'écran Fidélité — mêmes agrégats
     * `by_tier`/`points_issued`/`points_consumed` que la carte « Fidélité » du KPI,
     * pas une seconde implémentation divergente du même concept (voir §3 de la
     * méthode de conformité Figma : une formule déjà standardisée se réutilise).
     */
    public function loyaltySummary(array $agencyIds, Carbon $from, Carbon $to, int $pressingId): array
    {
        $tiers = LoyaltyTier::query()->where('pressing_id', $pressingId)->where('is_active', true)->orderBy('min_spend_amount')->get();

        $byTier = [];
        foreach ($tiers as $index => $tier) {
            $next = $tiers->get($index + 1);
            $query = Client::query()
                ->whereIn('agency_id', $agencyIds)
                ->where('is_active', true)
                ->where('loyalty_spend_12m', '>=', $tier->min_spend_amount);
            if ($next) {
                $query->where('loyalty_spend_12m', '<', $next->min_spend_amount);
            }
            $byTier[] = ['id' => $tier->id, 'name' => $tier->name, 'count' => $query->count()];
        }

        $movements = LoyaltyPointMovement::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('created_at', [$from, $to])
            ->get(['points']);

        return [
            'by_tier' => $byTier,
            'points_issued' => (int) $movements->where('points', '>', 0)->sum('points'),
            'points_consumed' => (int) $movements->where('points', '<', 0)->sum(fn ($m) => abs($m->points)),
        ];
    }

    /** @param  array<int>  $agencyIds */
    private function metrics(array $agencyIds, Carbon $from, Carbon $to): array
    {
        $orders = Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('created_at', [$from, $to]);
        $ordersCount = (clone $orders)->count();
        $expressCount = (clone $orders)->where('is_express', true)->count();
        $ordersTotal = (clone $orders)->sum('total_amount');

        $revenue = (int) Payment::query()
            ->whereIn('agency_id', $agencyIds)
            ->where('status', 'complete')
            ->whereBetween('paid_at', [$from, $to])
            ->sum('amount');

        $movements = StockMovement::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('occurred_at', [$from, $to])
            ->count();

        $lowStock = collect($agencyIds)->sum(fn (int $id) => $this->lowStockCount($id));

        $deliveries = Delivery::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('created_at', [$from, $to]);
        $deliveriesTotal = (clone $deliveries)->count();
        $deliveriesCompleted = (clone $deliveries)->where('status', 'livree')->count();
        $deliveriesFailed = (clone $deliveries)->where('status', 'echouee')->count();

        $attendances = Attendance::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $hoursWorked = $attendances
            ->filter(fn (Attendance $a) => $a->clock_in && $a->clock_out)
            ->sum(fn (Attendance $a) => $a->clock_in->diffInMinutes($a->clock_out) / 60);

        $activeSubscriptions = CustomerSubscription::query()
            ->whereIn('agency_id', $agencyIds)
            ->where('status', 'active')
            ->count();

        return [
            'revenue' => $revenue,
            'orders_count' => $ordersCount,
            'average_order_value' => $ordersCount > 0 ? (int) round($ordersTotal / $ordersCount) : 0,
            'express_rate' => $ordersCount > 0 ? round($expressCount / $ordersCount * 100, 1) : 0.0,
            'low_stock_items' => $lowStock,
            'stock_movements' => $movements,
            'deliveries_total' => $deliveriesTotal,
            'deliveries_completed' => $deliveriesCompleted,
            'deliveries_failed' => $deliveriesFailed,
            'delivery_completion_rate' => $deliveriesTotal > 0 ? round($deliveriesCompleted / $deliveriesTotal * 100, 1) : 0.0,
            'attendance_present' => $attendances->where('status', 'present')->count(),
            'attendance_retard' => $attendances->where('status', 'retard')->count(),
            'attendance_absent' => $attendances->where('status', 'absent')->count(),
            'hours_worked' => round($hoursWorked, 1),
            'active_subscriptions' => $activeSubscriptions,
        ];
    }

    /** Même règle que StockController::index : quantité en main <= seuil de réapprovisionnement. */
    private function lowStockCount(int $agencyId): int
    {
        $levels = AgencyStockItem::where('agency_id', $agencyId)->get()->keyBy('stock_item_id');

        return StockItem::where('is_active', true)->get()->reduce(function (int $carry, StockItem $item) use ($levels) {
            $level = $levels->get($item->id);
            $quantity = $level->quantity_on_hand ?? 0;
            $threshold = $level?->reorder_threshold_override ?? $item->default_reorder_threshold;

            return $carry + ($quantity <= $threshold ? 1 : 0);
        }, 0);
    }
}
