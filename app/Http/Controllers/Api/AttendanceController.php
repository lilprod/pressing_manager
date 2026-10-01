<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\AttendanceException;
use App\Http\Requests\Hr\ClockRequest;
use App\Models\Attendance;
use App\Services\AttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AttendanceController extends ApiController
{
    public function __construct(private readonly AttendanceService $attendances) {}

    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $manage = $request->user()->hasPermission('hr.manage');

        $attendances = Attendance::query()
            ->with('user', 'shift')
            ->whereIn('agency_id', $agencyId)
            ->when(! $manage, fn ($query) => $query->where('user_id', $request->user()->id))
            ->when($request->filled('date'), fn ($query) => $query->whereDate('created_at', $request->date('date')))
            ->latest('created_at')
            ->get();

        return response()->json($attendances);
    }

    public function clockIn(ClockRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyId = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $agencyId);

        try {
            $attendance = $this->attendances->clockIn($request->user(), $agencyId);
        } catch (AttendanceException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($attendance, 201);
    }

    public function clockOut(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'hr.clock');

        try {
            $attendance = $this->attendances->clockOut($request->user());
        } catch (AttendanceException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($attendance);
    }
}
