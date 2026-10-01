<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\TreatmentType\StoreTreatmentTypeRequest;
use App\Http\Requests\TreatmentType\UpdateTreatmentTypeRequest;
use App\Models\TreatmentType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Types de traitement (CDC §11.1-11.3, ex. Classique/Express/Repassage) : chacun porte un
 * price_ratio appliqué automatiquement au prix de l'article (Service) choisi à la création
 * d'un dépôt — voir OrderController::store(). Référentiel par pressing (pas par agence),
 * même portée que le catalogue d'articles (voir CLAUDE.md « Pivot multi-tenant »).
 */
class TreatmentTypeController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(TreatmentType::where('pressing_id', $request->user()->pressing_id)->orderBy('name')->get());
    }

    public function store(StoreTreatmentTypeRequest $request): JsonResponse
    {
        return response()->json(TreatmentType::create([
            ...$request->validated(),
            'pressing_id' => $request->user()->pressing_id,
        ]), 201);
    }

    public function update(UpdateTreatmentTypeRequest $request, TreatmentType $treatmentType): JsonResponse
    {
        if ($treatmentType->pressing_id !== $request->user()->pressing_id) {
            throw new HttpException(403, "Vous n'avez pas accès à ce type de traitement.");
        }

        $treatmentType->update($request->validated());

        return response()->json($treatmentType);
    }
}
