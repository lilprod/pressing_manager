<?php

namespace App\Http\Controllers\Api;

use App\Models\AgencyStockItem;
use App\Models\StockItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class StockController extends ApiController
{
    /**
     * Niveaux de stock courants d'une agence : tout le catalogue actif, avec la
     * quantité en main (0 si aucun mouvement n'a encore été enregistré) et une
     * alerte de réapprovisionnement.
     */
    public function index(Request $request): JsonResponse
    {
        $agencyId = $request->user()->agency_id ?? $request->integer('agency_id');

        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }

        $this->authorizeAgency($request->user(), $agencyId);

        $levels = AgencyStockItem::where('agency_id', $agencyId)->get()->keyBy('stock_item_id');

        $items = StockItem::where('is_active', true)->orderBy('name')->get()->map(function (StockItem $item) use ($levels, $agencyId) {
            $level = $levels->get($item->id);
            $quantity = $level->quantity_on_hand ?? 0;
            $threshold = $level?->reorder_threshold_override ?? $item->default_reorder_threshold;

            return [
                'stock_item_id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'unit' => $item->unit,
                'category' => $item->category,
                'agency_id' => $agencyId,
                'quantity_on_hand' => $quantity,
                'reorder_threshold' => $threshold,
                'is_low_stock' => $quantity <= $threshold,
            ];
        });

        return response()->json($items);
    }
}
