<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Controllers\Controller;
use App\Models\PlatformPlan;
use Illuminate\Http\JsonResponse;

class PlatformPlanController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(PlatformPlan::where('is_active', true)->orderBy('name')->get());
    }
}
