<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\TreatmentType>
 */
class TreatmentTypeFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->bothify('TRT-###')),
            'name' => fake()->unique()->word(),
            'price_ratio' => 1.00,
            'is_active' => true,
        ];
    }
}
