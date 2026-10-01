<?php

namespace Database\Factories;

use App\Models\Pressing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Supplier>
 */
class SupplierFactory extends Factory
{
    public function definition(): array
    {
        return [
            // Voir AgencyFactory : même réutilisation du premier pressing du test.
            'pressing_id' => fn () => Pressing::query()->value('id') ?? Pressing::factory()->create()->id,
            'agency_id' => null,
            'name' => fake()->company(),
            'phone' => fake()->e164PhoneNumber(),
            'is_active' => true,
        ];
    }
}
