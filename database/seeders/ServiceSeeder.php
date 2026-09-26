<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Service;
use Illuminate\Database\Seeder;

class ServiceSeeder extends Seeder
{
    public const SERVICES = [
        ['code' => 'NETT-CHEMISE', 'name' => 'Nettoyage chemise', 'category' => 'nettoyage', 'base_price' => 1000, 'estimated_duration_hours' => 24],
        ['code' => 'NETT-COSTUME', 'name' => 'Nettoyage costume', 'category' => 'nettoyage', 'base_price' => 3500, 'estimated_duration_hours' => 48],
        ['code' => 'NETT-ROBE', 'name' => 'Nettoyage robe', 'category' => 'nettoyage', 'base_price' => 3000, 'estimated_duration_hours' => 48],
        ['code' => 'REPAS-CHEMISE', 'name' => 'Repassage chemise', 'category' => 'repassage', 'base_price' => 500, 'estimated_duration_hours' => 12],
        ['code' => 'REPAS-PANTALON', 'name' => 'Repassage pantalon', 'category' => 'repassage', 'base_price' => 500, 'estimated_duration_hours' => 12],
        ['code' => 'RETOUCHE-OURLET', 'name' => 'Retouche ourlet', 'category' => 'retouche', 'base_price' => 1500, 'estimated_duration_hours' => 48],
        ['code' => 'TEINTURE-STD', 'name' => 'Teinture standard', 'category' => 'teinture', 'base_price' => 4000, 'estimated_duration_hours' => 72],
    ];

    public function run(): void
    {
        $services = collect(self::SERVICES)->map(function (array $service) {
            return Service::query()->updateOrCreate(['code' => $service['code']], [
                ...$service,
                'is_active' => true,
            ]);
        });

        // Chaque service est disponible dans chaque agence, au tarif de base par défaut.
        foreach (Agency::all() as $agency) {
            foreach ($services as $service) {
                $agency->services()->syncWithoutDetaching([
                    $service->id => ['is_active' => true],
                ]);
            }
        }
    }
}
