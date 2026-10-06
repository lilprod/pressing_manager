<?php

namespace App\Console\Commands;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyPointMovement;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Chantier « Re-audit Pressing — fidélité » (voir CLAUDE.md) : expire les points de
 * fidélité pour les agences qui ont configuré `loyalty_point_expiry_months`
 * (`agency_settings`, nullable — aucune agence n'est affectée par défaut). Un
 * mouvement de gain (`reason=payment`) expire en bloc (pas de consommation
 * partielle possible aujourd'hui) ; le solde du client ne descend jamais sous 0.
 */
class ExpireLoyaltyPoints extends Command
{
    protected $signature = 'loyalty:expire-points';

    protected $description = "Expire les points de fidélité des clients selon le délai configuré par agence";

    public function handle(): int
    {
        $expiredMovements = 0;

        Agency::query()
            ->whereHas('settings', fn ($q) => $q->whereNotNull('loyalty_point_expiry_months'))
            ->with('settings')
            ->each(function (Agency $agency) use (&$expiredMovements) {
                $months = $agency->settings->loyalty_point_expiry_months;

                $movements = LoyaltyPointMovement::where('agency_id', $agency->id)
                    ->where('reason', 'payment')
                    ->whereNull('expired_at')
                    ->where('created_at', '<=', now()->subMonths($months))
                    ->get();

                if ($movements->isEmpty()) {
                    return;
                }

                $movements->groupBy('client_id')->each(function ($clientMovements, $clientId) use ($agency, &$expiredMovements) {
                    $totalPoints = $clientMovements->sum('points');

                    DB::transaction(function () use ($clientId, $clientMovements, $totalPoints, $agency) {
                        $client = Client::query()->lockForUpdate()->find($clientId);
                        if ($client === null) {
                            return;
                        }

                        $decrement = min($totalPoints, $client->loyalty_points);
                        if ($decrement > 0) {
                            $client->decrement('loyalty_points', $decrement);
                        }

                        LoyaltyPointMovement::create([
                            'client_id' => $clientId,
                            'agency_id' => $agency->id,
                            'payment_id' => null,
                            'points' => -$decrement,
                            'reason' => 'expired',
                            'created_at' => now(),
                        ]);

                        LoyaltyPointMovement::whereIn('id', $clientMovements->pluck('id'))->update(['expired_at' => now()]);
                    });

                    $expiredMovements++;
                });
            });

        $this->info("Expiration(s) de points effectuée(s) pour {$expiredMovements} client(s).");

        return self::SUCCESS;
    }
}
