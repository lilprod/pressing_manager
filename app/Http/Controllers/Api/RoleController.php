<?php

namespace App\Http\Controllers\Api;

use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');

        return response()->json(Role::orderBy('name')->get());
    }
}
