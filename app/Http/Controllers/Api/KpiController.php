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
        [$agencyId, $from, $to] = $this->resolveParams($request);

        return response()->json($this->kpi->build($agencyId, $from, $to));
    }

    public function exportPdf(Request $request): Response
    {
        $this->authorizePermission($request->user(), 'reports.view');
        [$agencyId, $from, $to] = $this->resolveParams($request);
        $data = $this->kpi->build($agencyId, $from, $to);

        return Pdf::loadView('kpi.pdf', ['data' => $data])->download("kpi-{$data['from']}-{$data['to']}.pdf");
    }

    public function exportExcel(Request $request, KpiExcelExporter $exporter): StreamedResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        [$agencyId, $from, $to] = $this->resolveParams($request);
        $data = $this->kpi->build($agencyId, $from, $to);

        return $exporter->download($data);
    }

    /** @return array{0: ?int, 1: Carbon, 2: Carbon} */
    private function resolveParams(Request $request): array
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        if ($agencyId) {
            $this->authorizeAgency($request->user(), $agencyId);
        }

        $from = $request->filled('from') ? Carbon::parse($request->string('from')->value())->startOfDay() : now()->startOfMonth();
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->value())->endOfDay() : now()->endOfDay();

        return [$agencyId, $from, $to];
    }
}
