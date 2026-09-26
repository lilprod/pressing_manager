<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Order;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Delivery>
 */
class DeliveryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'order_id' => Order::factory(),
            'agency_id' => Agency::factory(),
            'address' => fake()->streetAddress(),
            'fee' => fake()->numberBetween(500, 2000),
            'status' => 'a_planifier',
        ];
    }
}
