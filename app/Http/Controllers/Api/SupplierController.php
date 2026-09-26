<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Stock\StoreSupplierRequest;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierController extends ApiController
{
    /** Fournisseurs visibles par une agence : les siens + les partagés (agency_id NULL). */
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $suppliers = Supplier::query()
            ->where('is_active', true)
            ->when($agencyId, fn ($query) => $query->where(fn ($q) => $q->whereNull('agency_id')->orWhere('agency_id', $agencyId)))
            ->orderBy('name')
            ->get();

        return response()->json($suppliers);
    }

    public function store(StoreSupplierRequest $request): JsonResponse
    {
        $data = $request->validated();
        if ($request->user()->agency_id !== null) {
            $data['agency_id'] = $request->user()->agency_id;
        }

        return response()->json(Supplier::create($data), 201);
    }
}
