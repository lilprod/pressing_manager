<?php

namespace App\Services;

use App\Models\License;
use App\Models\LicensePayment;
use Illuminate\Support\Facades\DB;

class LicenseService
{
    /**
     * Renouvellement confirmé de façon synchrone par un administrateur (le règlement
     * a déjà été perçu — espèces, virement, ou Mobile Money confirmé de visu — voir
     * l'hypothèse documentée dans docs/ARCHITECTURE.md sur les paiements licence/abonnement).
     */
    public function renew(License $license, string $plan, string $method, ?string $externalReference): LicensePayment
    {
        $config = config("licensing.plans.{$plan}");

        return DB::transaction(function () use ($license, $plan, $method, $externalReference, $config) {
            // Un renouvellement anticipé prolonge à partir de la date d'expiration actuelle,
            // pas de la date du jour, pour ne pas faire perdre de jours déjà payés.
            $base = now()->gt($license->expires_at) ? now() : $license->expires_at;
            $newExpiresAt = $base->copy()->addDays($config['days']);

            $payment = LicensePayment::create([
                'license_id' => $license->id,
                'amount' => $config['price'],
                'method' => $method,
                'external_reference' => $externalReference,
                'paid_at' => now(),
                'new_expires_at' => $newExpiresAt,
            ]);

            $license->plan = $plan;
            $license->expires_at = $newExpiresAt;
            $license->status = 'active';
            $license->save();

            return $payment;
        });
    }
}
