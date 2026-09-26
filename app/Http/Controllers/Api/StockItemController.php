<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Stock\StoreStockItemRequest;
use App\Models\StockItem;
use Illuminate\Http\JsonResponse;

class StockItemController extends ApiController
{
    public function index(): JsonResponse
    {
        return response()->json(StockItem::where('is_active', true)->orderBy('name')->get());
    }

    public function store(StoreStockItemRequest $request): JsonResponse
    {
        return response()->json(StockItem::create($request->validated()), 201);
    }
}
