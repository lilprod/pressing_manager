<?php

namespace Database\Seeders;

use App\Models\LoyaltyTier;
use Illuminate\Database\Seeder;

class LoyaltyTierSeeder extends Seeder
{
    public const TIERS = [
        ['name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05],
        ['name' => 'Or', 'min_points' => 150, 'discount_rate' => 0.10],
        ['name' => 'Platine', 'min_points' => 300, 'discount_rate' => 0.15],
    ];

    public function run(): void
    {
        foreach (self::TIERS as $tier) {
            LoyaltyTier::query()->updateOrCreate(['min_points' => $tier['min_points']], $tier + ['is_active' => true]);
        }
    }
}
