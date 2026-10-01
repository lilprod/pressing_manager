<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\StorePressingRequest;
use App\Http\Requests\Platform\UpdatePressingRequest;
use App\Models\Pressing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PressingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Pressing::query()->with('platformPlan')->latest();

        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($q) => $q->where('name', 'ilike', "%{$search}%")->orWhere('code', 'ilike', "%{$search}%"));
        }

        if ($request->filled('country_code')) {
            $query->where('country_code', $request->string('country_code'));
        }

        if ($request->filled('platform_plan_id')) {
            $query->where('platform_plan_id', $request->integer('platform_plan_id'));
        }

        if ($request->string('status')->toString() === 'renewal_due') {
            $query->whereNotNull('license_expires_at')
                ->where('license_expires_at', '>', now())
                ->where('license_expires_at', '<=', now()->addDays(30));
        } elseif ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return response()->json($query->paginate(15));
    }

    public function store(StorePressingRequest $request): JsonResponse
    {
        $pressing = Pressing::create($request->validated());
        $reportToken = $pressing->generateReportToken();

        return response()->json(
            $pressing->fresh('platformPlan')->toArray() + ['report_token' => $reportToken],
            201
        );
    }

    public function show(Pressing $pressing): JsonResponse
    {
        return response()->json($pressing->load('platformPlan'));
    }

    public function update(UpdatePressingRequest $request, Pressing $pressing): JsonResponse
    {
        $pressing->update($request->validated());

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function suspend(Pressing $pressing): JsonResponse
    {
        $pressing->update(['status' => 'suspended']);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function reactivate(Pressing $pressing): JsonResponse
    {
        $pressing->update(['status' => 'active']);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function rotateReportToken(Pressing $pressing): JsonResponse
    {
        return response()->json(['report_token' => $pressing->generateReportToken()]);
    }
}
