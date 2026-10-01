<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Pressing;
use Illuminate\Database\Seeder;

class AgencySeeder extends Seeder
{
    public function run(): void
    {
        $pressingId = Pressing::where('code', 'DEMO')->value('id');

        Agency::query()->updateOrCreate(['pressing_id' => $pressingId, 'code' => 'LOME-01'], [
            'name' => 'Pressing Lomé Centre',
            'city' => 'Lomé',
            'address' => 'Boulevard du 13 Janvier',
            'phone' => '+228 90 00 00 01',
            'unclaimed_item_threshold_days' => 30,
            'is_active' => true,
        ]);

        Agency::query()->updateOrCreate(['pressing_id' => $pressingId, 'code' => 'LOME-02'], [
            'name' => 'Pressing Agoè',
            'city' => 'Lomé',
            'address' => 'Route d\'Agoè',
            'phone' => '+228 90 00 00 02',
            'unclaimed_item_threshold_days' => 30,
            'is_active' => true,
        ]);

        Agency::query()->updateOrCreate(['pressing_id' => $pressingId, 'code' => 'KARA-01'], [
            'name' => 'Pressing Kara',
            'city' => 'Kara',
            'address' => 'Avenue de la Kozah',
            'phone' => '+228 90 00 00 03',
            'unclaimed_item_threshold_days' => 45,
            'is_active' => true,
        ]);
    }
}
