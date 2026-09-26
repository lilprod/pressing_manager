<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Supplier>
 */
class SupplierFactory extends Factory
{
    public function definition(): array
    {
        return [
            'agency_id' => null,
            'name' => fake()->company(),
            'phone' => fake()->e164PhoneNumber(),
            'is_active' => true,
        ];
    }
}
