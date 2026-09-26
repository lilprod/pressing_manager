<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Service>
 */
class ServiceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->bothify('SVC-###')),
            'name' => 'Nettoyage '.fake()->word(),
            'category' => fake()->randomElement(['nettoyage', 'repassage', 'retouche', 'teinture', 'autre']),
            'base_price' => fake()->numberBetween(500, 5000),
            'estimated_duration_hours' => 24,
            'is_active' => true,
        ];
    }
}
