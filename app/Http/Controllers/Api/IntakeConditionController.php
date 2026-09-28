<?php

namespace App\Http\Controllers\Api;

use App\Models\IntakeCondition;
use Illuminate\Http\JsonResponse;

class IntakeConditionController extends ApiController
{
    /**
     * Catalogue global (pas de filtrage par agence) : les comptoirs de toutes les agences
     * partagent la même liste d'états constatables à la réception.
     */
    public function index(): JsonResponse
    {
        return response()->json(IntakeCondition::where('is_active', true)->orderBy('label')->get());
    }
}
