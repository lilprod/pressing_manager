<?php

namespace App\Http\Controllers\Api;

use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'deliveries.manage');

        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $users = User::query()
            ->select('id', 'name', 'agency_id')
            ->where('is_active', true)
            ->when($request->filled('role'), function ($query) use ($request) {
                $roleId = Role::where('slug', $request->string('role')->value())->value('id');
                $query->where('role_id', $roleId);
            })
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }
}
