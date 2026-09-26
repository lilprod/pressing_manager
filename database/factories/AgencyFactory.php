<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Agency>
 */
class AgencyFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->bothify('AG-###')),
            'name' => 'Pressing '.fake()->city(),
            'city' => fake()->city(),
            'address' => fake()->streetAddress(),
            'phone' => fake()->e164PhoneNumber(),
            'unclaimed_item_threshold_days' => 30,
            'is_active' => true,
        ];
    }
}
