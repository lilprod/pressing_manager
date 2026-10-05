<?php

namespace Database\Seeders;

use App\Models\License;
use App\Models\Pressing;
use Illuminate\Database\Seeder;

/**
 * Une licence par pressing depuis l'harmonisation licence/plateforme (voir
 * CLAUDE.md) — `License::current()` l'auto-crée de toute façon à la demande, ce
 * seeder garantit juste qu'une base fraîchement seedée en a une d'emblée (annuelle,
 * pas l'essai de 30 jours par défaut, pour correspondre à l'ancien comportement
 * des données de démonstration).
 */
class LicenseSeeder extends Seeder
{
    public function run(): void
    {
        Pressing::query()->whereDoesntHave('license')->get()->each(function (Pressing $pressing) {
            License::create([
                'pressing_id' => $pressing->id,
                'plan' => 'annuel',
                'starts_at' => now(),
                'expires_at' => now()->addYear(),
                'grace_period_days' => 7,
                'status' => 'active',
            ]);
        });
    }
}
