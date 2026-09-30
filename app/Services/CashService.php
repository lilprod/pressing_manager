<?php

namespace App\Services;

use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Calcule le solde théorique de caisse depuis la dernière clôture (ou depuis le
 * début si aucune clôture n'existe encore) et enregistre les clôtures.
 *
 * Solde théorique = ouverture (compté de la clôture précédente, 0 sinon)
 *                  + encaissements espèces complets sur la période
 *                  + entrées manuelles - sorties manuelles sur la période.
 */
class CashService
{
    /**
     * @return array{opening_balance:int, cash_payments_total:int, manual_in_total:int, manual_out_total:int, expected_balance:int, since:?Carbon}
     */
    public function previewBalance(int $agencyId): array
    {
        $previous = CashClosure::query()->where('agency_id', $agencyId)->latest('closed_at')->first();
        $openingBalance = $previous?->counted_balance ?? 0;
        $since = $previous?->closed_at;

        $cashPaymentsTotal = (int) Payment::query()
            ->where('agency_id', $agencyId)
            ->where('method', 'espece')
            ->where('status', 'complete')
            ->when($since, fn ($query) => $query->where('paid_at', '>', $since))
            ->sum('amount');

        $manualIn = (int) CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'entree')
            ->when($since, fn ($query) => $query->where('occurred_at', '>', $since))
            ->sum('amount');

        $manualOut = (int) CashMovement::query()
            ->where('agency_id', $agencyId)
            ->where('type', 'sortie')
            ->when($since, fn ($query) => $query->where('occurred_at', '>', $since))
            ->sum('amount');

        return [
            'opening_balance' => $openingBalance,
            'cash_payments_total' => $cashPaymentsTotal,
            'manual_in_total' => $manualIn,
            'manual_out_total' => $manualOut,
            'expected_balance' => $openingBalance + $cashPaymentsTotal + $manualIn - $manualOut,
            'since' => $since,
        ];
    }

    public function closeRegister(int $agencyId, string $businessDate, int $countedBalance, ?string $notes, User $actor): CashClosure
    {
        return DB::transaction(function () use ($agencyId, $businessDate, $countedBalance, $notes, $actor) {
            if (CashClosure::query()->where('agency_id', $agencyId)->where('business_date', $businessDate)->lockForUpdate()->exists()) {
                throw new HttpException(409, 'Une clôture existe déjà pour cette date.');
            }

            $preview = $this->previewBalance($agencyId);

            return CashClosure::create([
                'agency_id' => $agencyId,
                'business_date' => $businessDate,
                'opening_balance' => $preview['opening_balance'],
                'cash_payments_total' => $preview['cash_payments_total'],
                'manual_in_total' => $preview['manual_in_total'],
                'manual_out_total' => $preview['manual_out_total'],
                'expected_balance' => $preview['expected_balance'],
                'counted_balance' => $countedBalance,
                'variance' => $countedBalance - $preview['expected_balance'],
                'notes' => $notes,
                'closed_by' => $actor->id,
                'closed_at' => now(),
            ]);
        });
    }
}
