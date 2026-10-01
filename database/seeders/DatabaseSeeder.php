<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            PermissionSeeder::class,
            PressingSeeder::class,
            AgencySeeder::class,
            ServiceSeeder::class,
            TreatmentTypeSeeder::class,
            IntakeConditionSeeder::class,
            LoyaltyTierSeeder::class,
            UserSeeder::class,
            ClientSeeder::class,
            LicenseSeeder::class,
            SubscriptionPlanSeeder::class,
            OrderSeeder::class,
            StockSeeder::class,
            DeliveryZoneSeeder::class,
            HrSeeder::class,
        ]);
    }
}
