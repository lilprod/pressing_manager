<?php

namespace Database\Seeders;

use App\Models\License;
use Illuminate\Database\Seeder;

class LicenseSeeder extends Seeder
{
    public function run(): void
    {
        if (License::count() > 0) {
            return;
        }

        License::create([
            'plan' => 'annuel',
            'starts_at' => now(),
            'expires_at' => now()->addYear(),
            'grace_period_days' => 7,
            'status' => 'active',
        ]);
    }
}
