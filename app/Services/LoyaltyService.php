<?php

namespace App\Services;

use App\Models\Client;
use App\Models\LoyaltyPointMovement;
use App\Models\Payment;

/**
 * Crédite automatiquement les points de fidélité d'un client à chaque paiement
 * complété (espèces ou distant). Le palier atteint (et sa remise) se déduit
 * ensuite du total de points via `Client::currentLoyaltyTier()`.
 */
class LoyaltyService
{
    public function creditPointsForPayment(Payment $payment): void
    {
        $points = intdiv($payment->amount, max(1, config('loyalty.amount_per_point')));
        if ($points <= 0) {
            return;
        }

        $client = Client::query()->lockForUpdate()->find($payment->client_id);
        if ($client === null) {
            return;
        }

        $client->increment('loyalty_points', $points);

        LoyaltyPointMovement::create([
            'client_id' => $client->id,
            'agency_id' => $payment->agency_id,
            'payment_id' => $payment->id,
            'points' => $points,
            'reason' => 'payment',
            'created_at' => now(),
        ]);
    }
}
