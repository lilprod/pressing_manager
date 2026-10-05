<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Cash\StoreCashClosureRequest;
use App\Http\Requests\Cash\StoreCashMovementRequest;
use App\Models\Agency;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Services\CashLedgerExcelExporter;
use App\Services\CashLedgerService;
use App\Services\CashMovementService;
use App\Services\CashService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
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
        $this->authorizeAgency($request->user(), $data['agency_id']);
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
        $this->authorizeAgency($request->user(), $agencyId);

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

    public function stats(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);
        $date = $request->filled('date') ? Carbon::parse($request->string('date')->value()) : now();

        return response()->json($this->cash->dailyStats($agencyId, $date));
    }

    public function paymentBreakdown(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);

        return response()->json($this->cash->paymentBreakdown($agencyId));
    }

    public function flowSeries(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);
        $to = $request->filled('date') ? Carbon::parse($request->string('date')->value())->endOfDay() : now()->endOfDay();
        $from = $to->copy()->subDays(13)->startOfDay();

        return response()->json($this->cash->flowSeries($agencyId, $from, $to));
    }

    public function ledger(Request $request, CashLedgerService $ledger): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);

        $entries = $ledger->query($agencyId, $this->ledgerFilters($request))
            ->paginate($request->integer('per_page', 20), ['*'], 'page', $request->integer('page', 1));

        return response()->json($entries);
    }

    public function exportLedgerPdf(Request $request, CashLedgerService $ledger): Response
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);
        [$from, $to] = $this->requireLedgerExportRange($request);

        $rows = $ledger->query($agencyId, $this->ledgerFilters($request))->get();
        $agency = Agency::findOrFail($agencyId);

        return Pdf::loadView('cash.ledger-pdf', ['rows' => $rows, 'agency' => $agency, 'from' => $from, 'to' => $to])
            ->download("journal-caisse-{$from}-{$to}.pdf");
    }

    public function exportLedgerExcel(Request $request, CashLedgerService $ledger, CashLedgerExcelExporter $exporter): StreamedResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);
        [$from, $to] = $this->requireLedgerExportRange($request);

        $rows = $ledger->query($agencyId, $this->ledgerFilters($request))->get()->all();
        $agency = Agency::findOrFail($agencyId);

        return $exporter->download($rows, $agency->name, $from, $to);
    }

    public function eligibleValidators(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);

        $validators = $this->cash->eligibleValidators($agencyId, $request->user()->pressing_id);

        return response()->json([
            'threshold' => config('cash.sensitive_movement_threshold'),
            'validators' => $validators,
            'count' => count($validators),
        ]);
    }

    public function showMovement(Request $request, CashMovement $movement): JsonResponse
    {
        $this->authorizeAgency($request->user(), $movement->agency_id);
        $this->authorizePermission($request->user(), 'payments.manage');

        return response()->json($movement->load('creator:id,name', 'validator:id,name'));
    }

    public function closurePrecheck(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);
        $businessDate = $request->filled('business_date') ? $request->string('business_date')->value() : now()->toDateString();

        return response()->json($this->cash->closurePrecheck($agencyId, $businessDate));
    }

    public function closureOperators(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyId = $this->resolveAgencyId($request);
        $date = $request->filled('business_date') ? Carbon::parse($request->string('business_date')->value()) : now();

        return response()->json(['operators' => $this->cash->operatorsForDate($agencyId, $date)]);
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
        $agencyId = $request->user()->agency_id ?? ($request->filled('agency_id') ? $request->integer('agency_id') : null);

        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }

        $this->authorizeAgency($request->user(), $agencyId);

        return $agencyId;
    }

    /** @return array{type?:string,status?:string,method?:string,search?:string,from?:string,to?:string} */
    private function ledgerFilters(Request $request): array
    {
        return array_filter([
            'type' => $request->string('type')->value() ?: null,
            'status' => $request->string('status')->value() ?: null,
            'method' => $request->string('method')->value() ?: null,
            'search' => $request->string('search')->value() ?: null,
            'from' => $request->string('from')->value() ?: null,
            'to' => $request->string('to')->value() ?: null,
        ], fn ($value) => $value !== null);
    }

    /**
     * L'export (PDF/Excel) exige des bornes de date explicites — contrairement à la
     * consultation paginée, un export n'a pas de limite de page pour se protéger d'une
     * requête sans limite sur tout l'historique de l'agence.
     *
     * @return array{0:string,1:string}
     */
    private function requireLedgerExportRange(Request $request): array
    {
        if (! $request->filled('from') || ! $request->filled('to')) {
            throw new HttpException(422, "Les paramètres 'from' et 'to' sont requis pour l'export.");
        }

        return [$request->string('from')->value(), $request->string('to')->value()];
    }
}
