<?php

namespace Database\Seeders;

use App\Models\IntakeCondition;
use Illuminate\Database\Seeder;

class IntakeConditionSeeder extends Seeder
{
    public const CONDITIONS = [
        ['code' => 'tache', 'label' => 'Taché'],
        ['code' => 'dechirure', 'label' => 'Déchiré'],
        ['code' => 'decoloration', 'label' => 'Décoloré'],
        ['code' => 'bouton_manquant', 'label' => 'Bouton manquant'],
        ['code' => 'usure', 'label' => 'Usure visible'],
        ['code' => 'odeur', 'label' => 'Odeur persistante'],
    ];

    public function run(): void
    {
        foreach (self::CONDITIONS as $condition) {
            IntakeCondition::query()->updateOrCreate(['code' => $condition['code']], $condition + ['is_active' => true]);
        }
    }
}
