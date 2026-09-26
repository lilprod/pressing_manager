<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Delivery\StoreDeliveryZoneRequest;
use App\Models\DeliveryZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryZoneController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $zones = DeliveryZone::query()
            ->where('is_active', true)
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->orderBy('name')
            ->get();

        return response()->json($zones);
    }

    public function store(StoreDeliveryZoneRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];

        return response()->json(DeliveryZone::create($data), 201);
    }
}
