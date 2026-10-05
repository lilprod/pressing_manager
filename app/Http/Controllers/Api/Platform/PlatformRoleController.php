<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\StorePlatformRoleRequest;
use App\Http\Requests\Platform\UpdatePlatformRoleRequest;
use App\Models\PlatformRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Phase 4 : gestion des rôles plateforme au-delà du catalogue fixe à 3 rôles —
 * réservée au superadmin (voir les FormRequests). Les permissions des rôles
 * système (`is_system`) ne sont jamais modifiables ici (seul leur nom peut être
 * ajusté) : rétirer une permission à `superadmin` via cet écran aurait pu
 * auto-verrouiller l'équipe Spark hors de ses propres actions gatées par
 * permission — un risque jugé disproportionné pour un gain cosmétique.
 */
class PlatformRoleController extends PlatformApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'platform_users.manage');

        return response()->json(PlatformRole::with('permissions')->orderBy('name')->get());
    }

    public function store(StorePlatformRoleRequest $request): JsonResponse
    {
        $data = $request->validated();

        $role = PlatformRole::create([
            'name' => $data['name'],
            'slug' => $this->uniqueSlug($data['name']),
            'is_system' => false,
        ]);

        $role->permissions()->sync($data['permission_ids'] ?? []);

        return response()->json($role->load('permissions'), 201);
    }

    public function update(UpdatePlatformRoleRequest $request, PlatformRole $platformRole): JsonResponse
    {
        $data = $request->validated();

        if (array_key_exists('name', $data)) {
            $platformRole->update(['name' => $data['name']]);
        }

        if (array_key_exists('permission_ids', $data)) {
            if ($platformRole->is_system) {
                throw new HttpException(409, "Les permissions d'un rôle système ne sont pas modifiables.");
            }
            $platformRole->permissions()->sync($data['permission_ids']);
        }

        return response()->json($platformRole->load('permissions'));
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 2;

        while (PlatformRole::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
