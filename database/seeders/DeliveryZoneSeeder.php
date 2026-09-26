<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\DeliveryZone;
use Illuminate\Database\Seeder;

class DeliveryZoneSeeder extends Seeder
{
    public const ZONES = [
        ['name' => 'Zone proche (< 3 km)', 'fee' => 500],
        ['name' => 'Zone intermédiaire (3-8 km)', 'fee' => 1000],
        ['name' => 'Zone étendue (> 8 km)', 'fee' => 2000],
    ];

    public function run(): void
    {
        foreach (Agency::all() as $agency) {
            foreach (self::ZONES as $zone) {
                DeliveryZone::query()->updateOrCreate(
                    ['agency_id' => $agency->id, 'name' => $zone['name']],
                    ['fee' => $zone['fee'], 'is_active' => true],
                );
            }
        }
    }
}
