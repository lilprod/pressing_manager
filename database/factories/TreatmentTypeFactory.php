<?php

namespace Database\Factories;

use App\Models\Pressing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\TreatmentType>
 */
class TreatmentTypeFactory extends Factory
{
    public function definition(): array
    {
        return [
            // Voir AgencyFactory : même réutilisation du premier pressing du test.
            'pressing_id' => fn () => Pressing::query()->value('id') ?? Pressing::factory()->create()->id,
            'code' => strtoupper(fake()->unique()->bothify('TRT-###')),
            'name' => fake()->unique()->word(),
            'price_ratio' => 1.00,
            'is_active' => true,
        ];
    }
}
