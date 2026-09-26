<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Http\Requests\Stock\StoreStockMovementRequest;
use App\Models\StockMovement;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class StockMovementController extends ApiController
{
    public function __construct(private readonly StockService $stock) {}

    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $movements = StockMovement::query()
            ->with('stockItem', 'supplier', 'user')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when($request->filled('stock_item_id'), fn ($query) => $query->where('stock_item_id', $request->integer('stock_item_id')))
            ->latest('occurred_at')
            ->paginate($request->integer('per_page', 30));

        return response()->json($movements);
    }

    public function store(StoreStockMovementRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyId = $request->user()->agency_id ?? $data['agency_id'];

        try {
            $movement = $this->stock->recordMovement(
                agencyId: $agencyId,
                stockItemId: $data['stock_item_id'],
                type: $data['type'],
                quantity: $data['quantity'],
                actor: $request->user(),
                supplierId: $data['supplier_id'] ?? null,
                unitCost: $data['unit_cost'] ?? null,
                reason: $data['reason'],
                notes: $data['notes'] ?? null,
            );
        } catch (InsufficientStockException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($movement->load('stockItem', 'supplier'), 201);
    }
}
