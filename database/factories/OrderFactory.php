<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Client;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Order>
 */
class OrderFactory extends Factory
{
    public function definition(): array
    {
        $agency = Agency::factory()->create();

        return [
            'agency_id' => $agency->id,
            'client_id' => Client::factory()->for($agency, 'agency'),
            'order_number' => fake()->unique()->numberBetween(1, 100000),
            'status' => 'recu',
            'is_express' => false,
            'source' => 'comptoir',
            'sync_status' => 'synced',
            'total_amount' => 0,
            'discount_amount' => 0,
        ];
    }
}
