<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Shift>
 */
class ShiftFactory extends Factory
{
    public function definition(): array
    {
        $start = fake()->dateTimeBetween('-1 week', '+1 week');

        return [
            'agency_id' => Agency::factory(),
            'user_id' => User::factory(),
            'starts_at' => $start,
            'ends_at' => (clone $start)->modify('+8 hours'),
        ];
    }
}
