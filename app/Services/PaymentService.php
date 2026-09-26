<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Centralise la création des paiements et le traitement idempotent des callbacks
 * des opérateurs (Flooz, T-Money) et du gateway carte.
 *
 * Aucune donnée de carte bancaire ne transite ni n'est stockée ici : seule une
 * référence externe de transaction (`external_reference`) est conservée.
 */
class PaymentService
{
    /**
     * Encaissement espèces : toujours immédiat, jamais hors-ligne pour cette version.
     */
    public function recordCashPayment(array $data, User $actor): Payment
    {
        return DB::transaction(function () use ($data, $actor) {
            $payment = Payment::create([
                'agency_id' => $data['agency_id'],
                'invoice_id' => $data['invoice_id'] ?? null,
                'client_id' => $data['client_id'],
                'method' => 'espece',
                'amount' => $data['amount'],
                'currency' => 'XOF',
                'status' => 'complete',
                'received_by' => $actor->id,
                'paid_at' => now(),
            ]);

            $this->applyToInvoiceIfPaid($payment);

            return $payment;
        });
    }

    /**
     * Initie un paiement carte ou Mobile Money : le paiement reste `en_attente`
     * jusqu'au callback de l'opérateur/gateway (voir handleWebhook).
     */
    public function initiateRemotePayment(array $data): Payment
    {
        return Payment::create([
            'agency_id' => $data['agency_id'],
            'invoice_id' => $data['invoice_id'] ?? null,
            'client_id' => $data['client_id'],
            'method' => $data['method'],
            'amount' => $data['amount'],
            'currency' => 'XOF',
            'status' => 'en_attente',
            // Référence que l'on transmet à l'opérateur ; il devra la renvoyer dans son callback.
            'external_reference' => (string) Str::uuid(),
        ]);
    }

    /**
     * Traite un callback opérateur/gateway de façon idempotente : rejouer le même
     * (method, external_reference) déjà traité ne modifie plus rien.
     *
     * @return Payment|null null si aucun paiement ne correspond à cette référence.
     */
    public function handleWebhook(string $method, string $externalReference, string $providerStatus, array $rawPayload): ?Payment
    {
        return DB::transaction(function () use ($method, $externalReference, $providerStatus, $rawPayload) {
            $payment = Payment::where('method', $method)
                ->where('external_reference', $externalReference)
                ->lockForUpdate()
                ->first();

            if ($payment === null) {
                return null;
            }

            if (in_array($payment->status, ['complete', 'echoue', 'rembourse'], true)) {
                // Déjà traité : callback rejoué, aucun double encaissement.
                return $payment;
            }

            $payment->status = match ($providerStatus) {
                'success' => 'complete',
                'failed' => 'echoue',
                default => $payment->status,
            };
            $payment->payload = $rawPayload;
            if ($payment->status === 'complete') {
                $payment->paid_at = now();
            }
            $payment->save();

            $this->applyToInvoiceIfPaid($payment);

            return $payment;
        });
    }

    private function applyToInvoiceIfPaid(Payment $payment): void
    {
        if ($payment->status !== 'complete' || $payment->invoice_id === null) {
            return;
        }

        /** @var Invoice $invoice */
        $invoice = Invoice::query()->lockForUpdate()->find($payment->invoice_id);
        if ($invoice === null) {
            return;
        }

        $paidTotal = $invoice->payments()->where('status', 'complete')->sum('amount');
        $invoice->status = $paidTotal >= $invoice->total_amount ? 'payee' : 'partiellement_payee';
        $invoice->save();
    }
}
