<?php

namespace Database\Factories;

use App\Models\Pressing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Service>
 */
class ServiceFactory extends Factory
{
    public function definition(): array
    {
        return [
            // Voir AgencyFactory : même réutilisation du premier pressing du test.
            'pressing_id' => fn () => Pressing::query()->value('id') ?? Pressing::factory()->create()->id,
            'code' => strtoupper(fake()->unique()->bothify('SVC-###')),
            'name' => 'Nettoyage '.fake()->word(),
            'category' => fake()->randomElement(['nettoyage', 'repassage', 'retouche', 'teinture', 'autre']),
            'billing_mode' => 'piece',
            'base_price' => fake()->numberBetween(500, 5000),
            'estimated_duration_hours' => 24,
            'is_active' => true,
            'allow_discount' => true,
            'round_to_hundred' => false,
            'price_editable_at_counter' => false,
        ];
    }
}
