<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\StockItem>
 */
class StockItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->bothify('ITEM-###')),
            'name' => fake()->words(2, true),
            'unit' => fake()->randomElement(['unite', 'kg', 'litre', 'paquet']),
            'category' => 'consommable',
            'default_reorder_threshold' => 10,
            'is_active' => true,
        ];
    }
}
