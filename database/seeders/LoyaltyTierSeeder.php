<?php

namespace Database\Seeders;

use App\Models\LoyaltyTier;
use App\Models\Pressing;
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
        $pressingId = Pressing::where('code', 'DEMO')->value('id');

        foreach (self::TIERS as $tier) {
            LoyaltyTier::query()->updateOrCreate(['pressing_id' => $pressingId, 'min_points' => $tier['min_points']], $tier + ['pressing_id' => $pressingId, 'is_active' => true]);
        }
    }
}
