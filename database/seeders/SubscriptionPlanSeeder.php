<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

class SubscriptionPlanSeeder extends Seeder
{
    public function run(): void
    {
        SubscriptionPlan::query()->updateOrCreate(
            ['name' => 'Forfait Mensuel 10kg'],
            [
                'agency_id' => null,
                'description' => '10 kg de linge par mois, tous services confondus.',
                'quota_type' => 'kg',
                'quota_amount' => 10,
                'price' => 8000,
                'duration_days' => 30,
                'is_active' => true,
            ],
        );

        SubscriptionPlan::query()->updateOrCreate(
            ['name' => 'Formule VIP 30 articles'],
            [
                'agency_id' => null,
                'description' => 'Jusqu\'à 30 articles par mois, priorité de traitement.',
                'quota_type' => 'articles',
                'quota_amount' => 30,
                'price' => 20000,
                'duration_days' => 30,
                'is_active' => true,
            ],
        );
    }
}
