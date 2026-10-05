<?php

namespace App\Http\Controllers\Api;

use App\Services\DailyReportExcelExporter;
use App\Services\DailyReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Bilan journalier et performance caissiers — écran « 08 Rapports & bilans »
 * jusqu'ici non construit (CLAUDE.md). Toujours à une seule agence (comme
 * `CashController`), jamais une vue consolidée multi-agences : un bilan de caisse
 * raisonne par caisse physique.
 */
class ReportController extends ApiController
{
    public function __construct(
        private readonly DailyReportService $dailyReport,
        private readonly DailyReportExcelExporter $exporter,
    ) {}

    public function daily(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        $agencyId = $this->resolveAgencyId($request);
        $date = $this->resolveDate($request);

        return response()->json($this->dailyReport->build($agencyId, $date));
    }

    public function exportExcel(Request $request): StreamedResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        $agencyId = $this->resolveAgencyId($request);
        $date = $this->resolveDate($request);

        $agency = \App\Models\Agency::find($agencyId);
        $data = $this->dailyReport->build($agencyId, $date);
        $data['agency_name'] = $agency?->name;

        return $this->exporter->download($data);
    }

    private function resolveDate(Request $request): Carbon
    {
        return $request->filled('date') ? Carbon::parse($request->string('date')->value()) : now();
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
}
