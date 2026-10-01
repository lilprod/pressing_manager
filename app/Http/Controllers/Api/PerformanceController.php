<?php

namespace App\Http\Controllers\Api;

use App\Services\PerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PerformanceController extends ApiController
{
    public function __construct(private readonly PerformanceService $performance) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'hr.manage');

        $agencyId = $request->user()->agency_id ?? ($request->filled('agency_id') ? $request->integer('agency_id') : null);
        if (! $agencyId) {
            throw new HttpException(422, 'Veuillez sélectionner une agence.');
        }
        $this->authorizeAgency($request->user(), $agencyId);

        $from = $request->filled('from') ? Carbon::parse($request->string('from')->value())->startOfDay() : now()->startOfMonth();
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->value())->endOfDay() : now()->endOfDay();

        return response()->json($this->performance->forAgency($agencyId, $from, $to));
    }
}
