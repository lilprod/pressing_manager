<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Loyalty\StoreLoyaltyTierRequest;
use App\Http\Requests\Loyalty\UpdateLoyaltyTierRequest;
use App\Models\LoyaltyTier;
use Illuminate\Http\JsonResponse;

class LoyaltyTierController extends ApiController
{
    public function index(): JsonResponse
    {
        return response()->json(LoyaltyTier::orderBy('min_points')->get());
    }

    public function store(StoreLoyaltyTierRequest $request): JsonResponse
    {
        return response()->json(LoyaltyTier::create($request->validated()), 201);
    }

    public function update(UpdateLoyaltyTierRequest $request, LoyaltyTier $loyaltyTier): JsonResponse
    {
        $loyaltyTier->update($request->validated());

        return response()->json($loyaltyTier);
    }
}
