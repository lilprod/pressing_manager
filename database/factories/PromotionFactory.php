<?php

namespace Database\Factories;

use App\Models\Pressing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Promotion>
 */
class PromotionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'pressing_id' => fn () => Pressing::query()->value('id') ?? Pressing::factory()->create()->id,
            'name' => fake()->unique()->words(3, true),
            'code' => strtoupper(fake()->unique()->bothify('PROMO##??')),
            'discount_type' => 'percentage',
            'discount_value' => fake()->numberBetween(5, 30),
            'max_discount_amount' => null,
            'starts_at' => now()->subDay()->toDateString(),
            'ends_at' => now()->addMonth()->toDateString(),
            'quota_total' => null,
            'quota_per_client' => null,
            'minimum_order_amount' => null,
            'combinable_with_loyalty' => false,
            'is_active' => true,
        ];
    }
}
