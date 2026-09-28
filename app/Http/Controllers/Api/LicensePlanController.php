<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\License\StoreLicensePlanRequest;
use App\Http\Requests\License\UpdateLicensePlanRequest;
use App\Models\LicensePlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LicensePlanController extends ApiController
{
    /** Tous les plans (actifs ou non), pour l'écran d'administration de la licence. */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'licenses.manage');

        return response()->json(LicensePlan::orderBy('days')->get());
    }

    public function store(StoreLicensePlanRequest $request): JsonResponse
    {
        $data = $request->validated();

        $plan = LicensePlan::create([
            ...$data,
            'slug' => $this->uniqueSlug($data['name']),
        ]);

        return response()->json($plan, 201);
    }

    public function update(UpdateLicensePlanRequest $request, LicensePlan $licensePlan): JsonResponse
    {
        $licensePlan->update($request->validated());

        return response()->json($licensePlan);
    }

    public function destroy(Request $request, LicensePlan $licensePlan): JsonResponse
    {
        $this->authorizePermission($request->user(), 'licenses.manage');

        $licensePlan->delete();

        return response()->json(status: 204);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 2;

        while (LicensePlan::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
