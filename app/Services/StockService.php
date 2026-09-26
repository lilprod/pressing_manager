<?php

namespace App\Services;

use App\Exceptions\InsufficientStockException;
use App\Models\AgencyStockItem;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockService
{
    /**
     * Enregistre un mouvement et met à jour la quantité en stock dans la même
     * transaction — la quantité n'est jamais modifiée autrement que par un mouvement,
     * pour que le journal reste la source de vérité complète.
     */
    public function recordMovement(
        int $agencyId,
        int $stockItemId,
        string $type,
        int $quantity,
        User $actor,
        ?int $supplierId = null,
        ?int $unitCost = null,
        string $reason = 'ajustement',
        ?string $notes = null,
    ): StockMovement {
        return DB::transaction(function () use ($agencyId, $stockItemId, $type, $quantity, $actor, $supplierId, $unitCost, $reason, $notes) {
            $stock = AgencyStockItem::firstOrCreate(
                ['agency_id' => $agencyId, 'stock_item_id' => $stockItemId],
                ['quantity_on_hand' => 0],
            );
            $stock = AgencyStockItem::where('id', $stock->id)->lockForUpdate()->first();

            if ($type === 'sortie' && $stock->quantity_on_hand < $quantity) {
                throw new InsufficientStockException($stock->quantity_on_hand, $quantity);
            }

            $stock->quantity_on_hand += $type === 'entree' ? $quantity : -$quantity;
            $stock->save();

            return StockMovement::create([
                'agency_id' => $agencyId,
                'stock_item_id' => $stockItemId,
                'supplier_id' => $supplierId,
                'user_id' => $actor->id,
                'type' => $type,
                'quantity' => $quantity,
                'unit_cost' => $unitCost,
                'reason' => $reason,
                'notes' => $notes,
                'occurred_at' => now(),
            ]);
        });
    }
}
