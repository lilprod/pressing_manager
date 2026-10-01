<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Subscription\StoreSubscriptionPlanRequest;
use App\Models\SubscriptionPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionPlanController extends ApiController
{
    /**
     * Plans visibles par une agence : les siens + les plans globaux de son pressing
     * (agency_id NULL, mais toujours rattachés à un pressing — voir CLAUDE.md).
     */
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $plans = SubscriptionPlan::where('pressing_id', $request->user()->pressing_id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('agency_id')->orWhereIn('agency_id', $agencyId))
            ->orderBy('name')
            ->get();

        return response()->json($plans);
    }

    public function store(StoreSubscriptionPlanRequest $request): JsonResponse
    {
        $data = $request->validated();
        if ($request->user()->agency_id !== null) {
            $data['agency_id'] = $request->user()->agency_id;
        } elseif ($data['agency_id'] ?? null) {
            $this->authorizeAgency($request->user(), $data['agency_id']);
        }
        $data['pressing_id'] = $request->user()->pressing_id;

        return response()->json(SubscriptionPlan::create($data), 201);
    }
}
