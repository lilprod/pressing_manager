<?php

namespace App\Http\Controllers\Api\Platform;

use App\Models\PlatformIncident;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Registre des incidents (lecture : reports.view ; écriture : pressings.manage). */
class PlatformIncidentController extends PlatformApiController
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $pressingIds = $this->resolvePressingFilter($user);

        $query = PlatformIncident::query()
            ->with(['pressing:id,name,code', 'opener:id,name', 'resolver:id,name'])
            ->when($pressingIds !== null, fn ($q) => $q->whereIn('pressing_id', $pressingIds))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('pressing_id'), fn ($q) => $q->where('pressing_id', $request->integer('pressing_id')))
            ->orderByRaw("status = 'open' desc")
            ->orderBy('priority')
            ->latest();

        return response()->json($query->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'pressings.manage');
        $data = $request->validate([
            'pressing_id' => ['nullable', 'integer', 'exists:pressings,id'],
            'title' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'priority' => ['required', 'in:P1,P2,P3'],
        ]);
        if (! empty($data['pressing_id'])) {
            $this->authorizePressing($user, (int) $data['pressing_id']);
        }

        $incident = PlatformIncident::create($data + ['opened_by' => $user->id, 'status' => 'open']);

        return response()->json($incident->load('pressing:id,name,code', 'opener:id,name'), 201);
    }

    public function update(Request $request, PlatformIncident $incident): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'pressings.manage');
        if ($incident->pressing_id) {
            $this->authorizePressing($user, $incident->pressing_id);
        }
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'priority' => ['sometimes', 'in:P1,P2,P3'],
            'status' => ['sometimes', 'in:open,resolved'],
            'resolution' => ['nullable', 'string', 'max:2000'],
        ]);
        if (($data['status'] ?? null) === 'resolved' && $incident->status !== 'resolved') {
            $data += ['resolved_at' => now(), 'resolved_by' => $user->id];
        } elseif (($data['status'] ?? null) === 'open') {
            $data += ['resolved_at' => null, 'resolved_by' => null];
        }
        $incident->update($data);

        return response()->json($incident->fresh()->load('pressing:id,name,code', 'opener:id,name', 'resolver:id,name'));
    }
}
