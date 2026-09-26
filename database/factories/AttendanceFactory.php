<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Attendance>
 */
class AttendanceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'agency_id' => Agency::factory(),
            'user_id' => User::factory(),
            'clock_in' => fake()->dateTimeBetween('-1 week', 'now'),
            'status' => 'present',
        ];
    }
}
