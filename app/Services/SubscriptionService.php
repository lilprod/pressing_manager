<?php

namespace App\Services;

use App\Models\Client;
use App\Models\CustomerSubscription;
use App\Models\CustomerSubscriptionPayment;
use App\Models\SubscriptionPlan;
use Illuminate\Support\Facades\DB;

/**
 * Comme pour la licence logicielle (voir LicenseService), le règlement d'un
 * abonnement est confirmé de façon synchrone par l'accueil (espèces perçues
 * ou Mobile Money confirmé de visu au comptoir) — pas de webhook différé ici.
 */
class SubscriptionService
{
    public function subscribe(Client $client, SubscriptionPlan $plan, int $agencyId, string $method, ?string $externalReference): CustomerSubscription
    {
        return DB::transaction(function () use ($client, $plan, $agencyId, $method, $externalReference) {
            $subscription = CustomerSubscription::create([
                'client_id' => $client->id,
                'subscription_plan_id' => $plan->id,
                'agency_id' => $agencyId,
                'started_at' => now(),
                'expires_at' => now()->addDays($plan->duration_days),
                'quota_used' => 0,
                'status' => 'active',
                'auto_renew' => false,
                'last_renewed_at' => now(),
            ]);

            CustomerSubscriptionPayment::create([
                'customer_subscription_id' => $subscription->id,
                'amount' => $plan->price,
                'method' => $method,
                'external_reference' => $externalReference,
                'paid_at' => now(),
            ]);

            return $subscription;
        });
    }

    public function renew(CustomerSubscription $subscription, string $method, ?string $externalReference): CustomerSubscriptionPayment
    {
        return DB::transaction(function () use ($subscription, $method, $externalReference) {
            $plan = $subscription->plan;
            $base = now()->gt($subscription->expires_at) ? now() : $subscription->expires_at;

            $subscription->expires_at = $base->copy()->addDays($plan->duration_days);
            $subscription->quota_used = 0;
            $subscription->status = 'active';
            $subscription->last_renewed_at = now();
            $subscription->save();

            return CustomerSubscriptionPayment::create([
                'customer_subscription_id' => $subscription->id,
                'amount' => $plan->price,
                'method' => $method,
                'external_reference' => $externalReference,
                'paid_at' => now(),
            ]);
        });
    }

    /**
     * Incrémente la consommation du quota lors d'une commande. Faute d'un champ
     * de poids (kg) sur les articles de commande (hors périmètre de l'étape 1),
     * la quantité d'articles sert d'unité de consommation pour les deux types
     * de quota ('kg' et 'articles') — voir l'hypothèse dans docs/ARCHITECTURE.md.
     * Le dépassement de quota n'est jamais bloquant : la commande est facturée
     * normalement au-delà (choix retenu parmi les deux options du cahier des charges).
     */
    public function consumeQuota(CustomerSubscription $subscription, int $quantity): void
    {
        $subscription->increment('quota_used', $quantity);
    }
}
