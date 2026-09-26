<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Subscription\StoreSubscriptionPlanRequest;
use App\Models\SubscriptionPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionPlanController extends ApiController
{
    /**
     * Plans visibles par une agence : les siens + les plans globaux (agency_id NULL).
     */
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $plans = SubscriptionPlan::query()
            ->where('is_active', true)
            ->when($agencyId, fn ($query) => $query->where(fn ($q) => $q->whereNull('agency_id')->orWhere('agency_id', $agencyId)))
            ->orderBy('name')
            ->get();

        return response()->json($plans);
    }

    public function store(StoreSubscriptionPlanRequest $request): JsonResponse
    {
        $data = $request->validated();
        if ($request->user()->agency_id !== null) {
            $data['agency_id'] = $request->user()->agency_id;
        }

        return response()->json(SubscriptionPlan::create($data), 201);
    }
}
