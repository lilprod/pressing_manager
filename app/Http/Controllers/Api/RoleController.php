<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Role\StoreRoleRequest;
use App\Http\Requests\Role\UpdateRoleRequest;
use App\Models\Role;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class RoleController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');

        // users_count : nombre de comptes portant le rôle (cartes de rôles et « Utilisateurs concernés »).
        return response()->json(Role::with('permissions')->withCount('users')->orderBy('name')->get());
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $data = $request->validated();

        $role = Role::create([
            'name' => $data['name'],
            'scope' => $data['scope'],
            'slug' => $this->uniqueSlug($data['name']),
        ]);

        $role->permissions()->sync($data['permission_ids'] ?? []);

        return response()->json($role->load('permissions'), 201);
    }

    public function update(UpdateRoleRequest $request, Role $role): JsonResponse
    {
        $data = $request->validated();

        $role->update(collect($data)->only(['name', 'scope'])->all());

        if (array_key_exists('permission_ids', $data)) {
            $role->permissions()->sync($data['permission_ids']);
        }

        return response()->json($role->load('permissions'));
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');

        $systemSlugs = array_column(RoleSeeder::ROLES, 'slug');

        if (in_array($role->slug, $systemSlugs, true)) {
            throw new HttpException(409, "Ce rôle est un rôle système et ne peut pas être supprimé.");
        }

        if ($role->users()->exists()) {
            throw new HttpException(409, "Ce rôle est attribué à des utilisateurs : impossible de le supprimer.");
        }

        $role->delete();

        return response()->json(status: 204);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 2;

        while (Role::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
