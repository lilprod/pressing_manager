<?php

namespace App\Http\Controllers\Api;

use App\Models\ReportSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ReportScheduleController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');

        return response()->json(ReportSchedule::with('agency:id,name')->where('pressing_id', $request->user()->pressing_id)->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'reports.view');
        $data = $this->validated($request);
        if (! empty($data['agency_id'])) {
            $this->authorizeAgency($request->user(), $data['agency_id']);
        } elseif ($request->user()->agency_id !== null) {
            $data['agency_id'] = $request->user()->agency_id;
        }

        $schedule = ReportSchedule::create($data + ['pressing_id' => $request->user()->pressing_id, 'created_by' => $request->user()->id]);

        return response()->json($schedule->load('agency:id,name'), 201);
    }

    public function update(Request $request, ReportSchedule $schedule): JsonResponse
    {
        $this->authorizeSchedule($request, $schedule);
        $schedule->update($request->validate(['is_active' => ['sometimes', 'boolean'], 'frequency' => ['sometimes', 'in:daily,weekly,monthly'], 'format' => ['sometimes', 'in:pdf,excel,csv']]));

        return response()->json($schedule->load('agency:id,name'));
    }

    public function destroy(Request $request, ReportSchedule $schedule): JsonResponse
    {
        $this->authorizeSchedule($request, $schedule);
        $schedule->delete();

        return response()->json(['message' => 'Envoi programmé supprimé.']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'frequency' => ['required', 'in:daily,weekly,monthly'],
            'format' => ['required', 'in:pdf,excel,csv'],
            'recipients' => ['required', 'array', 'min:1', 'max:10'],
            'recipients.*' => ['email'],
            'agency_id' => ['nullable', 'integer'],
        ]);
    }

    private function authorizeSchedule(Request $request, ReportSchedule $schedule): void
    {
        $this->authorizePermission($request->user(), 'reports.view');
        if ($schedule->pressing_id !== $request->user()->pressing_id || ($schedule->agency_id && ! $request->user()->canAccessAgency($schedule->agency_id))) {
            throw new HttpException(404, 'Envoi programmé introuvable.');
        }
    }
}
