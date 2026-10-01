<?php

namespace Database\Factories;

use App\Models\PlatformPlan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Pressing>
 */
class PressingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'Pressing '.fake()->unique()->company(),
            'code' => strtoupper(fake()->unique()->bothify('PR-####')),
            'platform_plan_id' => fn () => PlatformPlan::query()->value('id'),
            'status' => 'active',
        ];
    }
}
