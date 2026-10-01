<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\User\StoreUserRequest;
use App\Http\Requests\User\UpdateUserRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
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

        $agencyId = $this->resolvePressingScopedAgencyFilter($request, $request->user());

        $users = User::query()
            ->select('id', 'name', 'agency_id')
            ->where('pressing_id', $request->user()->pressing_id)
            ->where('is_active', true)
            ->when($request->filled('role'), function ($query) use ($request) {
                $roleId = Role::where('slug', $request->string('role')->value())->value('id');
                $query->where('role_id', $roleId);
            })
            ->when($agencyId !== null, fn ($query) => $query->where('agency_id', $agencyId))
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }

    /** Annuaire complet pour l'administration des comptes (rôle, agence, état du mot de passe). */
    private function indexForAdmin(Request $request): JsonResponse
    {
        $agencyId = $this->resolvePressingScopedAgencyFilter($request, $request->user());

        $users = User::query()
            ->where('pressing_id', $request->user()->pressing_id)
            ->with('role', 'agency')
            // Dernière activité = dernier usage d'un jeton Sanctum (colonne last_used_at déjà
            // tenue à jour par Sanctum à chaque requête authentifiée) : colonne « Dernière activité »
            // de l'annuaire. Exposé sous le nom last_active_at.
            ->withMax('tokens as last_active_at', 'last_used_at')
            ->when($request->filled('role'), function ($query) use ($request) {
                $roleId = Role::where('slug', $request->string('role')->value())->value('id');
                $query->where('role_id', $roleId);
            })
            ->when($agencyId !== null, fn ($query) => $query->where('agency_id', $agencyId))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        return response()->json($users);
    }

    /**
     * `UserController` liste la table `users` elle-même (pas une table liée par
     * `agency_id`) : contrairement à `resolveAgencyFilter` (qui renvoie toutes les
     * agences du pressing quand aucune n'est choisie, pour un `whereIn` sur une
     * table TOUJOURS rattachée à une agence), ici "aucune agence choisie" doit
     * laisser passer aussi les comptes à portée globale (`agency_id` null) du
     * pressing — d'où un simple filtre optionnel à une seule agence, combiné à un
     * `where('pressing_id', ...)` obligatoire dans l'appelant.
     */
    private function resolvePressingScopedAgencyFilter(Request $request, User $user): ?int
    {
        if ($user->agency_id !== null) {
            return $user->agency_id;
        }

        if ($request->filled('agency_id')) {
            $agencyId = $request->integer('agency_id');
            $this->authorizeAgency($user, $agencyId);

            return $agencyId;
        }

        return null;
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $role = Role::findOrFail($data['role_id']);

        // Un administrateur/manager d'agence ne peut créer que des comptes de sa propre agence.
        $agencyId = $request->user()->agency_id ?? ($data['agency_id'] ?? null);
        if ($role->isGlobal()) {
            $agencyId = null;
        } elseif ($agencyId !== null) {
            $this->authorizeAgency($request->user(), $agencyId);
        }

        $temporaryPassword = Str::password(12);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role_id' => $role->id,
            'agency_id' => $agencyId,
            'pressing_id' => $request->user()->pressing_id,
            'is_active' => true,
            'password' => Hash::make($temporaryPassword),
            'must_change_password' => true,
        ]);

        if ($request->hasFile('photo')) {
            $user->update(['photo_path' => $request->file('photo')->store("users/{$user->id}", ['disk' => config('filesystems.default')])]);
        }

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

        if (! empty($data['agency_id'])) {
            $this->authorizeAgency($request->user(), $data['agency_id']);
        }

        $user->update($data);

        return response()->json($user->fresh()->load('role', 'agency'));
    }

    public function updatePhoto(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');
        $this->authorizeUserAccess($request, $user);
        $request->validate(['photo' => ['required', 'image', 'max:2048']]);

        $disk = Storage::disk(config('filesystems.default'));
        if ($user->photo_path !== null) {
            $disk->delete($user->photo_path);
        }
        $user->update(['photo_path' => $request->file('photo')->store("users/{$user->id}", ['disk' => config('filesystems.default')])]);

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
        if ($user->pressing_id !== $actor->pressing_id) {
            throw new HttpException(403, "Vous n'avez pas accès à ce compte.");
        }
        if ($actor->agency_id !== null && $user->agency_id !== $actor->agency_id) {
            throw new HttpException(403, "Vous n'avez pas accès à ce compte.");
        }
    }
}
