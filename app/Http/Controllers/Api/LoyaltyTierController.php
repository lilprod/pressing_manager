<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Loyalty\StoreLoyaltyTierRequest;
use App\Http\Requests\Loyalty\UpdateLoyaltyTierRequest;
use App\Models\LoyaltyTier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Référentiel par pressing (pas par agence), même portée que le catalogue d'articles
 * et les types de traitement — voir CLAUDE.md « Pivot multi-tenant » / « Chantier D.1 ».
 */
class LoyaltyTierController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            LoyaltyTier::where('pressing_id', $request->user()->pressing_id)->orderBy('min_points')->get()
        );
    }

    public function store(StoreLoyaltyTierRequest $request): JsonResponse
    {
        return response()->json(LoyaltyTier::create([
            ...$request->validated(),
            'pressing_id' => $request->user()->pressing_id,
        ]), 201);
    }

    public function update(UpdateLoyaltyTierRequest $request, LoyaltyTier $loyaltyTier): JsonResponse
    {
        if ($loyaltyTier->pressing_id !== $request->user()->pressing_id) {
            throw new HttpException(403, "Vous n'avez pas accès à ce palier de fidélité.");
        }

        $loyaltyTier->update($request->validated());

        return response()->json($loyaltyTier);
    }
}
