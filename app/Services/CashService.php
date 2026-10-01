<?php

namespace App\Services;

use App\Models\CashClosure;
use App\Models\CashClosureCount;
use App\Models\CashMovement;
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
