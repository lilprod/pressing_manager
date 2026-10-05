<?php

namespace App\Services;

use App\Models\License;
use App\Models\LicensePayment;
use App\Models\PlatformPlan;
use Illuminate\Support\Facades\DB;

/**
 * Renouvellement confirmé de façon synchrone par la plateforme (le règlement a déjà
 * été perçu — espèces ou Mobile Money confirmé de visu par Spark, voir CLAUDE.md
 * « Licence / facturation — gap d'harmonisation » : décision v1, intégration PSP
 * différée). Depuis l'harmonisation, c'est une action plateforme exclusivement
 * (PressingController::renew(), côté Api/Platform) — plus un self-service tenant.
 */
class LicenseService
{
    /**
     * Le prix est toujours relu depuis le plan en base — jamais fourni tel quel par
     * l'appelant — pour éviter qu'un appel falsifié ne renouvelle pour un montant
     * arbitraire.
     */
    public function renew(License $license, PlatformPlan $plan, string $method, ?string $externalReference): LicensePayment
    {
        return DB::transaction(function () use ($license, $plan, $method, $externalReference) {
            // Un renouvellement anticipé prolonge à partir de la date d'expiration actuelle,
            // pas de la date du jour, pour ne pas faire perdre de jours déjà payés.
            $base = now()->gt($license->expires_at) ? now() : $license->expires_at;
            $newExpiresAt = $base->copy()->addDays($plan->duration_days);

            $payment = LicensePayment::create([
                'license_id' => $license->id,
                'amount' => $plan->price,
                'method' => $method,
                'external_reference' => $externalReference,
                'paid_at' => now(),
                'new_expires_at' => $newExpiresAt,
            ]);

            $license->plan = $plan->slug;
            $license->expires_at = $newExpiresAt;
            $license->status = 'active';
            $license->save();

            // Dénormalisé sur `pressings` pour le dashboard plateforme (état des
            // licences) — reste toujours un reflet exact de `licenses.expires_at`.
            $license->pressing?->update(['license_expires_at' => $newExpiresAt]);

            return $payment;
        });
    }
}
