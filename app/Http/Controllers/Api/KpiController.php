<?php

namespace App\Http\Controllers\Api;

use App\Services\KpiExcelExporter;
use App\Services\KpiService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

class KpiController extends ApiController
{
    public function __construct(private readonly KpiService $kpi) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        [$agencyId, $agencyIds, $from, $to] = $this->resolveParams($request);

        return response()->json($this->kpi->build($agencyId, $agencyIds, $from, $to, $request->user()->pressing_id));
    }

    public function exportPdf(Request $request): Response
    {
        $this->authorizePermission($request->user(), 'reports.view');
        [$agencyId, $agencyIds, $from, $to] = $this->resolveParams($request);
        $data = $this->kpi->build($agencyId, $agencyIds, $from, $to, $request->user()->pressing_id);

        return Pdf::loadView('kpi.pdf', ['data' => $data])->download("kpi-{$data['from']}-{$data['to']}.pdf");
    }

    public function exportExcel(Request $request, KpiExcelExporter $exporter): StreamedResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        [$agencyId, $agencyIds, $from, $to] = $this->resolveParams($request);
        $data = $this->kpi->build($agencyId, $agencyIds, $from, $to, $request->user()->pressing_id);

        return $exporter->download($data);
    }

    public function revenueSeries(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        [$agencyId, $agencyIds, $from, $to] = $this->resolveParams($request);
        $granularity = $request->string('granularity')->value() ?: 'day';
        $scopeIds = $agencyId ? [$agencyId] : $agencyIds;

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'granularity' => $granularity,
            'series' => $this->kpi->revenueSeries($scopeIds, $from, $to, $granularity),
        ]);
    }

    /** @return array{0: ?int, 1: array<int>, 2: Carbon, 3: Carbon} */
    private function resolveParams(Request $request): array
    {
        $agencyIds = $this->resolveAgencyFilter($request, $request->user());
        // Vue d'une seule agence seulement si explicitement choisie/imposée (un seul
        // id résolu) ; sinon vue consolidée sur toutes les agences du pressing.
        $agencyId = $request->user()->agency_id ?? ($request->filled('agency_id') ? $request->integer('agency_id') : null);
        if ($agencyId) {
            $this->authorizeAgency($request->user(), $agencyId);
        }

        $from = $request->filled('from') ? Carbon::parse($request->string('from')->value())->startOfDay() : now()->startOfMonth();
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->value())->endOfDay() : now()->endOfDay();

        return [$agencyId, $agencyIds, $from, $to];
    }
}
