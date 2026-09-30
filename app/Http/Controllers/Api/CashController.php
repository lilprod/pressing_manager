<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Cash\StoreCashClosureRequest;
use App\Http\Requests\Cash\StoreCashMovementRequest;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Services\CashService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CashController extends ApiController
{
    public function __construct(private readonly CashService $cash) {}

    public function summary(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);

        return response()->json($this->cash->previewBalance($agencyId));
    }

    public function indexMovements(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);

        $movements = CashMovement::query()
            ->where('agency_id', $agencyId)
            ->with('creator:id,name')
            ->orderByDesc('occurred_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json($movements);
    }

    public function storeMovement(StoreCashMovementRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $data['created_by'] = $request->user()->id;
        $data['occurred_at'] = now();

        $movement = CashMovement::create($data);

        return response()->json($movement->load('creator:id,name'), 201);
    }

    public function indexClosures(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);

        $closures = CashClosure::query()
            ->where('agency_id', $agencyId)
            ->with('closer:id,name')
            ->orderByDesc('business_date')
            ->paginate($request->integer('per_page', 20));

        return response()->json($closures);
    }

    public function showClosure(Request $request, CashClosure $closure): JsonResponse
    {
        $this->authorizeAgency($request->user(), $closure->agency_id);
        $this->authorizePermission($request->user(), 'payments.manage');

        return response()->json($closure->load('closer:id,name'));
    }

    public function storeClosure(StoreCashClosureRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyId = $request->user()->agency_id ?? $data['agency_id'];

        $closure = $this->cash->closeRegister($agencyId, $data['business_date'], $data['counted_balance'], $data['notes'] ?? null, $request->user());

        return response()->json($closure->load('closer:id,name'), 201);
    }

    private function resolveAgencyId(Request $request): int
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }

        return $agencyId;
    }
}
