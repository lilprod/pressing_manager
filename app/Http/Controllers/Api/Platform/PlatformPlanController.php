<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\StorePlatformPlanRequest;
use App\Http\Requests\Platform\UpdatePlatformPlanRequest;
use App\Models\PlatformPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PlatformPlanController extends PlatformApiController
{
    /** Liste active, publique au sein de la console — utilisée par le formulaire de renouvellement. */
    public function index(): JsonResponse
    {
        return response()->json(PlatformPlan::where('is_active', true)->orderBy('price')->get());
    }

    /** Catalogue complet (actifs et non), pour l'écran de gestion des plans. */
    public function manage(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'licenses.manage');

        return response()->json(PlatformPlan::orderBy('price')->get());
    }

    public function store(StorePlatformPlanRequest $request): JsonResponse
    {
        $data = $request->validated();

        $plan = PlatformPlan::create([
            ...$data,
            'slug' => $this->uniqueSlug($data['name']),
            'currency' => $data['currency'] ?? 'XOF',
        ]);

        return response()->json($plan, 201);
    }

    public function update(UpdatePlatformPlanRequest $request, PlatformPlan $platformPlan): JsonResponse
    {
        $platformPlan->update($request->validated());

        return response()->json($platformPlan);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 2;

        while (PlatformPlan::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
