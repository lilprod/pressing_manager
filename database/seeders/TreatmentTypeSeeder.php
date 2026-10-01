<?php

namespace Database\Seeders;

use App\Models\Pressing;
use App\Models\TreatmentType;
use Illuminate\Database\Seeder;

class TreatmentTypeSeeder extends Seeder
{
    public const TYPES = [
        ['code' => 'classique', 'name' => 'Classique', 'price_ratio' => 1.00],
        ['code' => 'express', 'name' => 'Express', 'price_ratio' => 1.50],
        ['code' => 'repassage_seul', 'name' => 'Repassage seul', 'price_ratio' => 0.50],
    ];

    public function run(): void
    {
        $pressingId = Pressing::where('code', 'DEMO')->value('id');

        foreach (self::TYPES as $type) {
            TreatmentType::query()->updateOrCreate(['pressing_id' => $pressingId, 'code' => $type['code']], $type + ['is_active' => true]);
        }
    }
}
