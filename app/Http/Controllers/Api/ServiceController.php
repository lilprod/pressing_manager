<?php

namespace App\Http\Controllers\Api;

use App\Models\Agency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ServiceController extends ApiController
{
    /**
     * Catalogue de services actifs pour une agence, avec le tarif effectif
     * (surcharge d'agence si définie, sinon tarif de base).
     */
    public function index(Request $request): JsonResponse
    {
        $agencyId = $request->user()->agency_id ?? $request->integer('agency_id');

        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }

        $this->authorizeAgency($request->user(), $agencyId);

        $agency = Agency::findOrFail($agencyId);
        $services = $agency->services()
            ->wherePivot('is_active', true)
            ->where('services.is_active', true)
            ->get()
            ->map(function ($service) {
                $service->effective_price = $service->pivot->price_override ?? $service->base_price;

                return $service;
            });

        return response()->json($services);
    }
}
