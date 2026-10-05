<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Support\Carbon;

/**
 * Bilan journalier et performance caissiers (CLAUDE.md « 08 Rapports & bilans »,
 * écran jusqu'ici non construit). Réutilise au maximum les formules déjà
 * standardisées par `CashService` plutôt que d'en réinventer — `stats()` emprunte
 * `revenue_today`/`outstanding` à `dailyStats()`, `cashiers` emprunte le même calcul
 * de statut opérateur que `operatorsForDate()`.
 */
class DailyReportService
{
    private const MOBILE_MONEY_METHODS = ['flooz', 'tmoney'];

    public function __construct(private readonly CashService $cash) {}

    /**
     * @return array{
     *     date:string,
     *     stats:array,
     *     payments_by_method:array,
     *     payments_by_hour:array,
     *     movements:array,
     *     movements_summary:array,
     *     settled_today:array,
     *     unpaid_today:array,
     *     discounts_today:int,
     *     cashiers:array,
     * }
     */
    public function build(int $agencyId, Carbon $date): array
    {
        $daily = $this->cash->dailyStats($agencyId, $date);

        $transactionsCount = (int) Payment::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'complete')
            ->whereDate('paid_at', $date)
            ->count();

        $averageBasket = $transactionsCount > 0 ? (int) round($daily['revenue_today'] / $transactionsCount) : 0;

        return [
            'date' => $date->toDateString(),
            'stats' => [
                'revenue_today' => $daily['revenue_today'],
                'outstanding' => $daily['outstanding'],
                'transactions_count' => $transactionsCount,
                'average_basket' => $averageBasket,
                'cash_variance' => $this->cashVarianceForDate($agencyId, $date),
            ],
            'payments_by_method' => $this->paymentsByMethod($agencyId, $date),
            'payments_by_hour' => $this->paymentsByHour($agencyId, $date),
            'movements' => $this->movementsForDate($agencyId, $date),
            'movements_summary' => $this->movementsSummary($agencyId, $date),
            'settled_today' => $this->settledToday($agencyId, $date),
            'unpaid_today' => $this->unpaidToday($agencyId, $date),
            'discounts_today' => $this->discountsToday($agencyId, $date),
            'cashiers' => $this->cashierPerformance($agencyId, $date),
        ];
    }

    /**
     * Écart de la clôture du jour, si elle existe — jamais un écart à 0 fabriqué
     * pour un jour pas encore clôturé (même principe que `last_closure` de
     * `CashService::dailyStats()`).
     */
    private function cashVarianceForDate(int $agencyId, Carbon $date): ?int
    {
        return \App\Models\CashClosure::query()
            ->where('agency_id', $agencyId)
            ->whereDate('closed_at', $date)
            ->value('variance');
    }

    /**
     * Granularité réelle à 4 valeurs d'enum (`espece|carte|flooz|tmoney`), bornée au
     * jour calendaire — distinct de `CashService::paymentBreakdown()` (depuis la
     * dernière clôture, 3 buckets seulement, sémantique différente).
     *
     * @return array<string,array{amount:int,percent:float}>
     */
    private function paymentsByMethod(int $agencyId, Carbon $date): array
    {
        $totals = Payment::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'complete')
            ->whereDate('paid_at', $date)
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
     * Série horaire des encaissements, bornée à la plage [première heure, dernière
     * heure] de transaction du jour — jamais 24 créneaux fabriqués (`Agency` n'a pas
     * de champ horaires d'ouverture, même décision déjà actée ailleurs dans l'app).
     *
     * @return array<int,array{hour:int,total:int}>
     */
    private function paymentsByHour(int $agencyId, Carbon $date): array
    {
        $byHour = Payment::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'complete')
            ->whereDate('paid_at', $date)
            ->selectRaw('EXTRACT(HOUR FROM paid_at)::int as hour, sum(amount) as total')
            ->groupBy('hour')
            ->pluck('total', 'hour');

        if ($byHour->isEmpty()) {
            return [];
        }

        $hours = $byHour->keys()->map(fn ($h) => (int) $h);
        $first = $hours->min();
        $last = $hours->max();

        $series = [];
        for ($hour = $first; $hour <= $last; $hour++) {
            $series[] = ['hour' => $hour, 'total' => (int) ($byHour[$hour] ?? 0)];
        }

        return $series;
    }

    /** @return array<int,array{id:int,type:string,category:?string,amount:int,creator:?string,occurred_at:Carbon}> */
    private function movementsForDate(int $agencyId, Carbon $date): array
    {
        return CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'valide')
            ->whereDate('occurred_at', $date)
            ->with('creator:id,name')
            ->orderByDesc('occurred_at')
            ->get()
            ->map(fn (CashMovement $movement) => [
                'id' => $movement->id,
                'type' => $movement->type,
                'category' => $movement->category,
                'amount' => $movement->amount,
                'creator' => $movement->creator?->name,
                'occurred_at' => $movement->occurred_at,
            ])
            ->values()
            ->all();
    }

    /** @return array{in_total:int, out_total:int, count:int} */
    private function movementsSummary(int $agencyId, Carbon $date): array
    {
        $movements = CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'valide')
            ->whereDate('occurred_at', $date)
            ->get(['type', 'amount']);

        return [
            'in_total' => (int) $movements->where('type', 'entree')->sum('amount'),
            'out_total' => (int) $movements->where('type', 'sortie')->sum('amount'),
            'count' => $movements->count(),
        ];
    }

    /**
     * « Soldé aujourd'hui » : facture payée ayant reçu au moins un paiement complet
     * aujourd'hui — `Invoice` n'a pas de colonne `paid_at`, dérivé honnêtement d'un
     * join sur `payments.paid_at` plutôt que d'en inventer une.
     *
     * @return array{count:int, amount:int}
     */
    private function settledToday(int $agencyId, Carbon $date): array
    {
        $invoices = Invoice::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'payee')
            ->whereHas('payments', fn ($q) => $q->where('status', 'complete')->whereDate('paid_at', $date))
            ->get(['id', 'total_amount']);

        return ['count' => $invoices->count(), 'amount' => (int) $invoices->sum('total_amount')];
    }

    /** @return array{count:int, amount:int} */
    private function unpaidToday(int $agencyId, Carbon $date): array
    {
        $invoices = Invoice::query()
            ->where('agency_id', $agencyId)
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->whereDate('issued_at', $date)
            ->withSum(['payments as paid_amount' => fn ($q) => $q->where('status', 'complete')], 'amount')
            ->get();

        return [
            'count' => $invoices->count(),
            'amount' => (int) $invoices->sum(fn (Invoice $invoice) => max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0))),
        ];
    }

    private function discountsToday(int $agencyId, Carbon $date): int
    {
        return (int) Order::query()
            ->where('agency_id', $agencyId)
            ->whereDate('created_at', $date)
            ->sum('discount_amount');
    }

    /**
     * Performance par caissier — n'apparaît que les caissiers ayant réellement
     * encaissé au moins un paiement ce jour (jamais une ligne à 0 FCFA fabriquée
     * pour un employé présent mais sans vente). Statut dérivé de `Attendance` du
     * jour pour ce caissier, même construction que `CashService::operatorsForDate()`.
     *
     * @return array<int,array{user_id:int,name:string,amount:int,transactions_count:int,average_basket:int,status:?string}>
     */
    private function cashierPerformance(int $agencyId, Carbon $date): array
    {
        $payments = Payment::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'complete')
            ->whereDate('paid_at', $date)
            ->whereNotNull('received_by')
            ->with('receiver:id,name')
            ->get(['received_by', 'amount']);

        $attendanceStatus = Attendance::query()
            ->where('agency_id', $agencyId)
            ->whereDate('clock_in', $date)
            ->get(['user_id', 'clock_out'])
            ->groupBy('user_id')
            ->map(fn ($rows) => $rows->contains(fn ($a) => $a->clock_out === null) ? 'en_attente' : 'verifie');

        return $payments
            ->groupBy('received_by')
            ->map(function ($rows, $userId) use ($attendanceStatus) {
                $amount = (int) $rows->sum('amount');
                $count = $rows->count();

                return [
                    'user_id' => (int) $userId,
                    'name' => $rows->first()->receiver?->name ?? '—',
                    'amount' => $amount,
                    'transactions_count' => $count,
                    'average_basket' => $count > 0 ? (int) round($amount / $count) : 0,
                    'status' => $attendanceStatus[$userId] ?? null,
                ];
            })
            ->sortByDesc('amount')
            ->values()
            ->all();
    }
}
