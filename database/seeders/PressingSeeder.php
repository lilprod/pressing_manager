<?php

namespace Database\Seeders;

use App\Models\PlatformPlan;
use App\Models\Pressing;
use Illuminate\Database\Seeder;

/**
 * Pressing de démo pour les seeders tenant (pivot multi-tenant, voir CLAUDE.md).
 * `migrate:fresh --seed` doit rester utilisable : les autres seeders tenant
 * (agences, services, utilisateurs...) rattachent leurs lignes à ce pressing.
 */
class PressingSeeder extends Seeder
{
    public function run(): void
    {
        Pressing::query()->updateOrCreate(['code' => 'DEMO'], [
            'name' => 'Pressing Démo',
            'platform_plan_id' => PlatformPlan::where('slug', 'pro')->value('id') ?? PlatformPlan::query()->value('id'),
            'status' => 'active',
        ]);
    }
}
