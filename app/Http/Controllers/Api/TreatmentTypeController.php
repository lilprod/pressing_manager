<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\TreatmentType\StoreTreatmentTypeRequest;
use App\Http\Requests\TreatmentType\UpdateTreatmentTypeRequest;
use App\Models\TreatmentType;
use Illuminate\Http\JsonResponse;

/**
 * Types de traitement (CDC §11.1-11.3, ex. Classique/Express/Repassage) : chacun porte un
 * price_ratio appliqué automatiquement au prix de l'article (Service) choisi à la création
 * d'un dépôt — voir OrderController::store(). Référentiel global (pas par agence), même
 * portée que le catalogue d'articles.
 */
class TreatmentTypeController extends ApiController
{
    public function index(): JsonResponse
    {
        return response()->json(TreatmentType::orderBy('name')->get());
    }

    public function store(StoreTreatmentTypeRequest $request): JsonResponse
    {
        return response()->json(TreatmentType::create($request->validated()), 201);
    }

    public function update(UpdateTreatmentTypeRequest $request, TreatmentType $treatmentType): JsonResponse
    {
        $treatmentType->update($request->validated());

        return response()->json($treatmentType);
    }
}
