<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Cash\StoreCashClosureRequest;
use App\Http\Requests\Cash\StoreCashMovementRequest;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Services\CashMovementService;
use App\Services\CashService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CashController extends ApiController
{
    public function __construct(
        private readonly CashService $cash,
        private readonly CashMovementService $movements,
    ) {}

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
            ->with('creator:id,name', 'validator:id,name')
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')->value()))
            ->orderByDesc('occurred_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json($movements);
    }

    public function storeMovement(StoreCashMovementRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        if ($request->hasFile('proof')) {
            $data['proof'] = $request->file('proof');
        }

        $movement = $this->movements->create($data, $request->user());

        return response()->json($movement->load('creator:id,name'), 201);
    }

    public function validateMovement(Request $request, CashMovement $movement): JsonResponse
    {
        $this->authorizeAgency($request->user(), $movement->agency_id);
        $this->authorizePermission($request->user(), 'payments.manage');

        $movement = $this->movements->validate($movement, $request->user());

        return response()->json($movement->load('creator:id,name', 'validator:id,name'));
    }

    public function movementProof(Request $request, CashMovement $movement): StreamedResponse
    {
        $this->authorizeAgency($request->user(), $movement->agency_id);
        $this->authorizePermission($request->user(), 'payments.manage');

        if ($movement->proof_path === null || ! Storage::disk(config('filesystems.default'))->exists($movement->proof_path)) {
            throw new HttpException(404, 'Pièce justificative introuvable.');
        }

        return Storage::disk(config('filesystems.default'))->response($movement->proof_path);
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

        return response()->json($closure->load('closer:id,name', 'counts'));
    }

    public function storeClosure(StoreCashClosureRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyId = $request->user()->agency_id ?? $data['agency_id'];

        $closure = $this->cash->closeRegister(
            $agencyId,
            $data['business_date'],
            $data['counts'],
            $data['checklist'],
            $data['notes'] ?? null,
            $request->user(),
        );

        return response()->json($closure->load('closer:id,name', 'counts'), 201);
    }

    public function closurePdf(Request $request, CashClosure $closure): StreamedResponse
    {
        $this->authorizeAgency($request->user(), $closure->agency_id);
        $this->authorizePermission($request->user(), 'payments.manage');

        if ($closure->pdf_path === null || ! Storage::disk(config('filesystems.default'))->exists($closure->pdf_path)) {
            throw new HttpException(404, 'Rapport PDF introuvable.');
        }

        return Storage::disk(config('filesystems.default'))->response($closure->pdf_path);
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
