<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\User\StoreUserRequest;
use App\Http\Requests\User\UpdateUserRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class UserController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        if ($request->boolean('full') && $request->user()->hasPermission('users.manage')) {
            return $this->indexForAdmin($request);
        }

        // Listing du personnel utilisé par les modules Livraisons (choix du livreur) et RH (planning) —
        // toute permission de gestion d'agence suffit à consulter la liste, pas seulement l'une des deux.
        if (! $request->user()->hasPermission('deliveries.manage') && ! $request->user()->hasPermission('hr.manage')) {
            throw new HttpException(403, 'Permission manquante.');
        }

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

    /** Annuaire complet pour l'administration des comptes (rôle, agence, état du mot de passe). */
    private function indexForAdmin(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $users = User::query()
            ->with('role', 'agency')
            ->when($request->filled('role'), function ($query) use ($request) {
                $roleId = Role::where('slug', $request->string('role')->value())->value('id');
                $query->where('role_id', $roleId);
            })
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $role = Role::findOrFail($data['role_id']);

        // Un administrateur/manager d'agence ne peut créer que des comptes de sa propre agence.
        $agencyId = $request->user()->agency_id ?? ($data['agency_id'] ?? null);
        if ($role->isGlobal()) {
            $agencyId = null;
        }

        $temporaryPassword = Str::password(12);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role_id' => $role->id,
            'agency_id' => $agencyId,
            'is_active' => true,
            'password' => Hash::make($temporaryPassword),
            'must_change_password' => true,
        ]);

        return response()->json([
            ...$user->load('role', 'agency')->toArray(),
            'temporary_password' => $temporaryPassword,
        ], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $this->authorizeUserAccess($request, $user);

        $data = $request->validated();
        if (array_key_exists('role_id', $data) && Role::findOrFail($data['role_id'])->isGlobal()) {
            $data['agency_id'] = null;
        } elseif ($request->user()->agency_id !== null) {
            // Un acteur local ne peut pas déplacer un compte vers une autre agence.
            unset($data['agency_id']);
        }

        $user->update($data);

        return response()->json($user->fresh()->load('role', 'agency'));
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');
        $this->authorizeUserAccess($request, $user);

        $temporaryPassword = Str::password(12);
        $user->update([
            'password' => Hash::make($temporaryPassword),
            'must_change_password' => true,
            'password_changed_at' => null,
        ]);

        return response()->json(['temporary_password' => $temporaryPassword]);
    }

    private function authorizeUserAccess(Request $request, User $user): void
    {
        $actor = $request->user();
        if ($actor->agency_id !== null && $user->agency_id !== $actor->agency_id) {
            throw new HttpException(403, "Vous n'avez pas accès à ce compte.");
        }
    }
}
