<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\StockItem;
use App\Models\Supplier;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Database\Seeder;

class StockSeeder extends Seeder
{
    public const ITEMS = [
        ['code' => 'DETERGENT-STD', 'name' => 'Détergent standard', 'unit' => 'litre', 'category' => 'consommable', 'default_reorder_threshold' => 10],
        ['code' => 'CINTRE-PLASTIQUE', 'name' => 'Cintre plastique', 'unit' => 'unite', 'category' => 'emballage', 'default_reorder_threshold' => 100],
        ['code' => 'HOUSSE-PLASTIQUE', 'name' => 'Housse plastique', 'unit' => 'paquet', 'category' => 'emballage', 'default_reorder_threshold' => 20],
        ['code' => 'DETACHANT', 'name' => 'Détachant textile', 'unit' => 'litre', 'category' => 'consommable', 'default_reorder_threshold' => 5],
        ['code' => 'ETIQUETTE-QR', 'name' => 'Rouleau d\'étiquettes QR', 'unit' => 'unite', 'category' => 'consommable', 'default_reorder_threshold' => 3],
    ];

    public function run(): void
    {
        $items = collect(self::ITEMS)->map(
            fn (array $item) => StockItem::query()->updateOrCreate(['code' => $item['code']], [...$item, 'is_active' => true]),
        );

        $stockService = app(StockService::class);
        $admin = User::whereHas('role', fn ($q) => $q->where('slug', 'admin'))->first();

        foreach (Agency::all() as $agency) {
            $supplier = Supplier::query()->updateOrCreate(
                ['name' => "Fournitures {$agency->city}"],
                ['agency_id' => null, 'phone' => '+228 91 00 00 00', 'is_active' => true],
            );

            foreach ($items as $item) {
                $stockService->recordMovement(
                    agencyId: $agency->id,
                    stockItemId: $item->id,
                    type: 'entree',
                    quantity: $item->default_reorder_threshold * 3,
                    actor: $admin,
                    supplierId: $supplier->id,
                    reason: 'livraison',
                    notes: 'Stock initial',
                );
            }
        }
    }
}
