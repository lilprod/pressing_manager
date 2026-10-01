<?php

namespace App\Http\Controllers\Api\Platform;

use App\Models\PlatformRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformRoleController extends PlatformApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'platform_users.manage');

        return response()->json(PlatformRole::with('permissions')->orderBy('name')->get());
    }
}
