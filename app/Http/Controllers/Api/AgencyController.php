<?php

namespace App\Http\Controllers\Api;

use App\Models\Agency;
use Illuminate\Http\JsonResponse;

class AgencyController extends ApiController
{
    /**
     * Liste des agences actives, utilisée par le sélecteur d'agence des rôles globaux
     * et pour résoudre le nom/code d'agence dans l'interface.
     */
    public function index(): JsonResponse
    {
        return response()->json(Agency::where('is_active', true)->orderBy('name')->get());
    }
}
