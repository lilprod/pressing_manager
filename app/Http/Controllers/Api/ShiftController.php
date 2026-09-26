<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Hr\StoreShiftRequest;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $manage = $request->user()->hasPermission('hr.manage');

        $shifts = Shift::query()
            ->with('user')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when(! $manage, fn ($query) => $query->where('user_id', $request->user()->id))
            ->when($request->filled('from'), fn ($query) => $query->whereDate('starts_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($query) => $query->whereDate('starts_at', '<=', $request->date('to')))
            ->orderBy('starts_at')
            ->get();

        return response()->json($shifts);
    }

    public function store(StoreShiftRequest $request): JsonResponse
    {
        $data = $request->validated();
        $targetUser = User::findOrFail($data['user_id']);
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $data['agency_id']);
        $this->authorizeAgency($request->user(), $targetUser->agency_id ?? $data['agency_id']);

        return response()->json(Shift::create($data)->load('user'), 201);
    }
}
