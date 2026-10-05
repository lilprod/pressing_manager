<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\CashClosure;
use App\Models\CashClosureCount;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Calcule le solde théorique de caisse depuis la dernière clôture (ou depuis le
 * début si aucune clôture n'existe encore) et enregistre les clôtures.
 *
 * Solde théorique espèces = ouverture (compté de la clôture précédente, 0 sinon)
 *                  + encaissements espèces complets sur la période
 *                  + entrées manuelles validées - sorties manuelles validées sur la période.
 *
 * Mobile Money et Carte n'ont pas de "solde physique" entre deux clôtures (contrairement
 * aux espèces, rien n'est retiré/déposé manuellement dans ces moyens) : leur théorique est
 * simplement la somme des paiements complets de la période, à rapprocher d'un relevé
 * opérateur/banque externe au système.
 */
class CashService
{
    private const MOBILE_MONEY_METHODS = ['flooz', 'tmoney'];

    /**
     * @return array{opening_balance:int, cash_payments_total:int, manual_in_total:int, manual_out_total:int, expected_balance:int, since:?Carbon, by_method:array<string,array{theoretical:int}>}
     */
    public function previewBalance(int $agencyId): array
    {
        $previous = CashClosure::query()->where('agency_id', $agencyId)->latest('closed_at')->first();
        $openingBalance = $previous?->counted_balance ?? 0;
        $since = $previous?->closed_at;

        $cashPaymentsTotal = $this->paymentsTotal($agencyId, 'espece', $since);

        $manualIn = (int) CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'entree')
            ->where('status', 'valide')
            ->when($since, fn ($query) => $query->where('occurred_at', '>', $since))
            ->sum('amount');

        $manualOut = (int) CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'sortie')
            ->where('status', 'valide')
            ->when($since, fn ($query) => $query->where('occurred_at', '>', $since))
            ->sum('amount');

        $mobileMoneyTotal = (int) Payment::query()
            ->where('agency_id', $agencyId)
            ->whereIn('method', self::MOBILE_MONEY_METHODS)
            ->where('status', 'complete')
            ->when($since, fn ($query) => $query->where('paid_at', '>', $since))
            ->sum('amount');

        $carteTotal = $this->paymentsTotal($agencyId, 'carte', $since);

        return [
            'opening_balance' => $openingBalance,
            'cash_payments_total' => $cashPaymentsTotal,
            'manual_in_total' => $manualIn,
            'manual_out_total' => $manualOut,
            'expected_balance' => $openingBalance + $cashPaymentsTotal + $manualIn - $manualOut,
            'since' => $since,
            'by_method' => [
                'espece' => ['theoretical' => $openingBalance + $cashPaymentsTotal + $manualIn - $manualOut],
                'mobile_money' => ['theoretical' => $mobileMoneyTotal],
                'carte' => ['theoretical' => $carteTotal],
            ],
        ];
    }

    /**
     * @param  array<string,int>  $counts  compté par méthode : espece, mobile_money, carte
     * @param  string[]  $checklist  clés cochées parmi config('cash.closure_checklist_steps')
     */
    public function closeRegister(
        int $agencyId,
        string $businessDate,
        array $counts,
        array $checklist,
        ?string $notes,
        User $actor,
    ): CashClosure {
        return DB::transaction(function () use ($agencyId, $businessDate, $counts, $checklist, $notes, $actor) {
            if (CashClosure::query()->where('agency_id', $agencyId)->where('business_date', $businessDate)->lockForUpdate()->exists()) {
                throw new HttpException(409, 'Une clôture existe déjà pour cette date.');
            }

            if (CashMovement::query()->where('agency_id', $agencyId)->where('status', 'en_attente')->exists()) {
                throw new HttpException(422, 'Des mouvements de caisse sont en attente de validation : résolvez-les avant de clôturer.');
            }

            $required = config('cash.closure_checklist_steps');
            if (array_diff($required, $checklist) !== []) {
                throw new HttpException(422, 'La checklist de clôture doit être entièrement complétée.');
            }

            $preview = $this->previewBalance($agencyId);

            $variances = [
                'espece' => $counts['espece'] - $preview['by_method']['espece']['theoretical'],
                'mobile_money' => $counts['mobile_money'] - $preview['by_method']['mobile_money']['theoretical'],
                'carte' => $counts['carte'] - $preview['by_method']['carte']['theoretical'],
            ];

            if (array_sum(array_map('abs', $variances)) !== 0 && blank($notes)) {
                throw new HttpException(422, "Un écart a été constaté : une justification ('notes') est obligatoire.");
            }

            $closure = CashClosure::create([
                'agency_id' => $agencyId,
                'business_date' => $businessDate,
                'opening_balance' => $preview['opening_balance'],
                'cash_payments_total' => $preview['cash_payments_total'],
                'manual_in_total' => $preview['manual_in_total'],
                'manual_out_total' => $preview['manual_out_total'],
                'expected_balance' => $preview['by_method']['espece']['theoretical'],
                'counted_balance' => $counts['espece'],
                'variance' => $variances['espece'],
                'notes' => $notes,
                'checklist' => $checklist,
                'closed_by' => $actor->id,
                'closed_at' => now(),
            ]);

            foreach (['espece', 'mobile_money', 'carte'] as $method) {
                CashClosureCount::create([
                    'cash_closure_id' => $closure->id,
                    'method' => $method,
                    'theoretical_amount' => $preview['by_method'][$method]['theoretical'],
                    'counted_amount' => $counts[$method],
                    'variance' => $variances[$method],
                ]);
            }

            $pdfPath = "cash-closures/{$closure->id}.pdf";
            $pdf = Pdf::loadView('cash.closure-pdf', ['closure' => $closure->load('agency', 'closer', 'counts')]);
            Storage::disk(config('filesystems.default'))->put($pdfPath, $pdf->output());
            $closure->update(['pdf_path' => $pdfPath]);

            return $closure->fresh(['counts', 'closer']);
        });
    }

    /**
     * KPI du jour pour l'écran "Centre de caisse" (Figma) : recettes/dépenses bornées à
     * une journée calendaire (contrairement à previewBalance(), qui raisonne depuis la
     * dernière clôture) + impayés réels + dernière clôture réelle (jamais fabriquée : si
     * aucune clôture n'existe encore, `last_closure` est `null`, pas un écart à 0).
     *
     * @return array{date:string, revenue_today:int, expenses_today:int, outstanding:int, last_closure:?array{id:int,variance:int,closed_at:string}, last_activity_at:?Carbon}
     */
    public function dailyStats(int $agencyId, Carbon $date): array
    {
        $revenueToday = (int) Payment::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'complete')
            ->whereDate('paid_at', $date)
            ->sum('amount');

        $expensesToday = (int) CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'sortie')
            ->where('status', 'valide')
            ->whereDate('occurred_at', $date)
            ->sum('amount');

        $outstanding = (int) Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->where('agency_id', $agencyId)
            ->withSum(['payments as paid_amount' => fn ($query) => $query->where('status', 'complete')], 'amount')
            ->get()
            ->sum(fn (Invoice $invoice) => max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0)));

        $lastClosure = CashClosure::query()->where('agency_id', $agencyId)->latest('closed_at')->first();

        $lastActivityAt = collect([
            CashMovement::query()->where('agency_id', $agencyId)->max('occurred_at'),
            CashClosure::query()->where('agency_id', $agencyId)->max('closed_at'),
            Payment::query()->where('agency_id', $agencyId)->where('status', 'complete')->max('paid_at'),
        ])->filter()->map(fn ($value) => Carbon::parse($value))->sortDesc()->first();

        return [
            'date' => $date->toDateString(),
            'revenue_today' => $revenueToday,
            'expenses_today' => $expensesToday,
            'outstanding' => $outstanding,
            'last_closure' => $lastClosure ? [
                'id' => $lastClosure->id,
                'variance' => $lastClosure->variance,
                'closed_at' => $lastClosure->closed_at,
            ] : null,
            'last_activity_at' => $lastActivityAt,
        ];
    }

    /**
     * Ventilation des encaissements par moyen de paiement depuis la dernière clôture
     * (mêmes totaux que previewBalance(), mais présentés avec un pourcentage calculé
     * côté backend pour que l'affichage ne puisse jamais diverger d'un arrondi frontend).
     *
     * @return array{since:?Carbon, total:int, by_method:array<string,array{amount:int,percent:float}>}
     */
    public function paymentBreakdown(int $agencyId): array
    {
        $previous = CashClosure::query()->where('agency_id', $agencyId)->latest('closed_at')->first();
        $since = $previous?->closed_at;

        $espece = $this->paymentsTotal($agencyId, 'espece', $since);
        $carte = $this->paymentsTotal($agencyId, 'carte', $since);
        $mobileMoney = (int) Payment::query()
            ->where('agency_id', $agencyId)
            ->whereIn('method', self::MOBILE_MONEY_METHODS)
            ->where('status', 'complete')
            ->when($since, fn ($query) => $query->where('paid_at', '>', $since))
            ->sum('amount');

        $total = $espece + $carte + $mobileMoney;
        $percent = fn (int $amount): float => $total > 0 ? round($amount / $total * 100, 1) : 0.0;

        return [
            'since' => $since,
            'total' => $total,
            'by_method' => [
                'espece' => ['amount' => $espece, 'percent' => $percent($espece)],
                'mobile_money' => ['amount' => $mobileMoney, 'percent' => $percent($mobileMoney)],
                'carte' => ['amount' => $carte, 'percent' => $percent($carte)],
            ],
        ];
    }

    /**
     * Flux de caisse quotidien (entrées/sorties) sur une plage de dates, jours sans
     * opération comblés à 0 — même patron que MultiAgencyService::revenueSeries(), mais
     * à deux séries (entrées = paiements complets + mouvements manuels d'entrée validés ;
     * sorties = mouvements manuels de sortie validés).
     *
     * @return array{from:string, to:string, series:array<int,array{date:string,in:int,out:int,net:int}>, in_total:int, out_total:int, net_total:int}
     */
    public function flowSeries(int $agencyId, Carbon $from, Carbon $to): array
    {
        $inPayments = Payment::query()
            ->where('agency_id', $agencyId)
            ->where('status', 'complete')
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw('DATE(paid_at) as day, sum(amount) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $inMovements = CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'entree')
            ->where('status', 'valide')
            ->whereBetween('occurred_at', [$from, $to])
            ->selectRaw('DATE(occurred_at) as day, sum(amount) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $outMovements = CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'sortie')
            ->where('status', 'valide')
            ->whereBetween('occurred_at', [$from, $to])
            ->selectRaw('DATE(occurred_at) as day, sum(amount) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];
        $inTotal = 0;
        $outTotal = 0;
        $cursor = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();
        $guard = 0;
        while ($cursor->lte($end) && $guard < 366) {
            $key = $cursor->toDateString();
            $in = (int) ($inPayments[$key] ?? 0) + (int) ($inMovements[$key] ?? 0);
            $out = (int) ($outMovements[$key] ?? 0);
            $series[] = ['date' => $key, 'in' => $in, 'out' => $out, 'net' => $in - $out];
            $inTotal += $in;
            $outTotal += $out;
            $cursor->addDay();
            $guard++;
        }

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'series' => $series,
            'in_total' => $inTotal,
            'out_total' => $outTotal,
            'net_total' => $inTotal - $outTotal,
        ];
    }

    /**
     * Personnel ayant pointé un jour donné, avec un statut dérivé honnêtement de
     * `clock_out` (pointage terminé = "verifie", encore en poste = "en_attente") — pas
     * de nouvelle colonne de validation RH. Même patron que
     * MultiAgencyService::teamPresent(), mais borné à $date au lieu de "maintenant".
     *
     * @return array<int,array{user:?array{id:int,name:string},clock_in:Carbon,clock_out:?Carbon,status:string}>
     */
    public function operatorsForDate(int $agencyId, Carbon $date): array
    {
        return Attendance::query()
            ->where('agency_id', $agencyId)
            ->whereDate('clock_in', $date)
            ->with('user:id,name')
            ->get()
            ->map(fn (Attendance $attendance) => [
                'user' => $attendance->user ? ['id' => $attendance->user->id, 'name' => $attendance->user->name] : null,
                'clock_in' => $attendance->clock_in,
                'clock_out' => $attendance->clock_out,
                'status' => $attendance->clock_out === null ? 'en_attente' : 'verifie',
            ])
            ->values()
            ->all();
    }

    /**
     * Mêmes conditions EXACTES que les deux verrous réels de closeRegister() (mouvements
     * en attente qui bloquent la clôture, clôture déjà existante pour cette date) — pas
     * une estimation séparée qui pourrait diverger du comportement réel.
     *
     * @return array{pending_movements_count:int, already_closed:bool, last_closure:?array{id:int,business_date:string,variance:int}}
     */
    public function closurePrecheck(int $agencyId, string $businessDate): array
    {
        $pendingCount = CashMovement::query()->where('agency_id', $agencyId)->where('status', 'en_attente')->count();
        $alreadyClosed = CashClosure::query()->where('agency_id', $agencyId)->where('business_date', $businessDate)->exists();
        $lastClosure = CashClosure::query()->where('agency_id', $agencyId)->latest('closed_at')->first();

        return [
            'pending_movements_count' => $pendingCount,
            'already_closed' => $alreadyClosed,
            'last_closure' => $lastClosure ? [
                'id' => $lastClosure->id,
                'business_date' => $lastClosure->business_date->toDateString(),
                'variance' => $lastClosure->variance,
            ] : null,
        ];
    }

    /**
     * Collaborateurs réellement habilités à valider un mouvement sensible de cette
     * agence (payments.manage + accès à l'agence) — jamais une liste figée à 2 noms
     * comme le suggère la maquette : aucune table d'affectation de "validateurs
     * désignés" n'existe, cette liste est le substitut honnête.
     *
     * @return array<int,array{id:int,name:string}>
     */
    public function eligibleValidators(int $agencyId, int $pressingId): array
    {
        return User::query()
            ->where('pressing_id', $pressingId)
            ->where(fn ($query) => $query->where('agency_id', $agencyId)->orWhereNull('agency_id'))
            ->where('is_active', true)
            ->whereHas('role.permissions', fn ($query) => $query->where('slug', 'payments.manage'))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name])
            ->all();
    }

    private function paymentsTotal(int $agencyId, string $method, ?Carbon $since): int
    {
        return (int) Payment::query()
            ->where('agency_id', $agencyId)
            ->where('method', $method)
            ->where('status', 'complete')
            ->when($since, fn ($query) => $query->where('paid_at', '>', $since))
            ->sum('amount');
    }
}
