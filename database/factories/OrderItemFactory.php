<?php

namespace Database\Factories;

use App\Models\Order;
use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OrderItem>
 */
class OrderItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'order_id' => Order::factory(),
            'agency_id' => fn (array $attributes) => Order::find($attributes['order_id'])->agency_id,
            'service_id' => Service::factory(),
            'qr_code' => strtoupper('QR-'.Str::random(10)),
            'quantity' => 1,
            'unit_price' => fake()->numberBetween(500, 5000),
            'status' => 'recu',
        ];
    }
}
