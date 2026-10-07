<?php

namespace Database\Seeders;

use App\Models\LoyaltyTier;
use App\Models\Pressing;
use Illuminate\Database\Seeder;

class LoyaltyTierSeeder extends Seeder
{
    /**
     * Audit « Promotions et fidélité » (CLAUDE.md) : seuils en FCFA de dépenses sur
     * les 12 derniers mois glissants (`min_spend_amount`), plus `point_multiplier`
     * et `benefit_description` réels (saisis par l'administrateur, pas un mécanisme
     * automatique) — alignés sur la maquette Figma « Niveaux de fidélité ».
     */
    public const TIERS = [
        ['name' => 'Essentiel', 'min_spend_amount' => 0, 'discount_rate' => 0.0, 'point_multiplier' => 1.0, 'benefit_description' => 'Aucun bonus'],
        ['name' => 'Argent', 'min_spend_amount' => 100000, 'discount_rate' => 0.05, 'point_multiplier' => 1.1, 'benefit_description' => '+10 % de points'],
        ['name' => 'Or', 'min_spend_amount' => 300000, 'discount_rate' => 0.10, 'point_multiplier' => 1.25, 'benefit_description' => 'Priorité & retouches'],
        ['name' => 'Platine', 'min_spend_amount' => 700000, 'discount_rate' => 0.15, 'point_multiplier' => 1.5, 'benefit_description' => 'Collecte offerte'],
    ];

    public function run(): void
    {
        $pressingId = Pressing::where('code', 'DEMO')->value('id');

        foreach (self::TIERS as $tier) {
            LoyaltyTier::query()->updateOrCreate(['pressing_id' => $pressingId, 'min_spend_amount' => $tier['min_spend_amount']], $tier + ['pressing_id' => $pressingId, 'is_active' => true]);
        }
    }
}
