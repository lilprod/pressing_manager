<?php

namespace App\Services;

use App\Models\AgencySetting;
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
        // Chantier « Re-audit Pressing — fidélité » (CLAUDE.md) : `agency_settings.
        // loyalty_amount_per_point` existait déjà (éditable sur /settings/operational
        // depuis le chantier Opérationnel du 2026-10-02) mais n'était jamais lu ici —
        // le calcul retombait toujours sur le config global, quel que soit le réglage
        // de l'agence. Repli sur le config global uniquement si l'agence n'a rien
        // personnalisé (comportement inchangé pour toute agence existante).
        $amountPerPoint = AgencySetting::forAgency($payment->agency_id)->loyalty_amount_per_point
            ?? config('loyalty.amount_per_point');
        $points = intdiv($payment->amount, max(1, $amountPerPoint));
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
