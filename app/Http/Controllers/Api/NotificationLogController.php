<?php

namespace App\Http\Controllers\Api;

use App\Models\NotificationLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class NotificationLogController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'notifications.manage');

        $agencyId = $request->user()->agency_id ?? ($request->filled('agency_id') ? $request->integer('agency_id') : null);
        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }
        $this->authorizeAgency($request->user(), $agencyId);

        $logs = NotificationLog::query()
            ->with('client')
            ->where('agency_id', $agencyId)
            ->when($request->filled('event'), fn ($query) => $query->where('event', $request->string('event')->value()))
            ->latest('sent_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json($logs);
    }
}
