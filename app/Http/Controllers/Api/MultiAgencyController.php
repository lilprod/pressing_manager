<?php

namespace App\Http\Controllers\Api;

use App\Models\Agency;
use App\Services\MultiAgencyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vue consolidée multi-agences (écran « Multi-agences », section 10 Figma + captures Drive 2026-10-01). */
class MultiAgencyController extends ApiController
{
    public function __construct(private readonly MultiAgencyService $service)
    {
    }

    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        [$from, $to] = $this->resolveDateRange($request);
        $agencyId = $user->agency_id ?? ($request->filled('agency_id') ? $request->integer('agency_id') : null);
        if ($agencyId !== null) {
            $this->authorizeAgency($user, $agencyId);
        }

        return response()->json($this->service->overview($from, $to, $agencyId, $user->pressing_id));
    }

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $this->authorizeAgency($user, $agency->id);
        [$from, $to] = $this->resolveDateRange($request);

        return response()->json($this->service->agencyDetail($agency, $from, $to, $user->agency_id === null));
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function resolveDateRange(Request $request): array
    {
        $from = $request->filled('from') ? Carbon::parse($request->string('from')->value())->startOfDay() : now()->startOfMonth();
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->value())->endOfDay() : now()->endOfDay();

        return [$from, $to];
    }
}
