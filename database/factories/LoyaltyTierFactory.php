<?php

namespace Database\Factories;

use App\Models\Pressing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\LoyaltyTier>
 */
class LoyaltyTierFactory extends Factory
{
    public function definition(): array
    {
        return [
            // Voir AgencyFactory : même réutilisation du premier pressing du test.
            'pressing_id' => fn () => Pressing::query()->value('id') ?? Pressing::factory()->create()->id,
            'name' => fake()->unique()->word(),
            'min_points' => fake()->unique()->numberBetween(10, 1000),
            'discount_rate' => fake()->randomFloat(2, 0.01, 0.2),
            'is_active' => true,
        ];
    }
}
