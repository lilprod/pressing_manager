<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\User\StoreUserRequest;
use App\Http\Requests\User\UpdateUserRequest;
use App\Models\AuthEvent;
use App\Models\Role;
use App\Support\UserAgent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class UserController extends ApiController
{
    private const INVITATION_HOURS = 72;

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
        $users = $this->adminQuery($request)
            ->with('role', 'agency', 'extraAgencies:id,name')
            // Dernière activité = dernier usage d'un jeton Sanctum (colonne last_used_at déjà
            // tenue à jour par Sanctum à chaque requête authentifiée) : colonne « Dernière activité »
            // de l'annuaire. Exposé sous le nom last_active_at.
            ->withMax('tokens as last_active_at', 'last_used_at')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        return response()->json($users);
    }

    /**
     * Filtres de l'annuaire : agence (principale OU complémentaire), rôle, recherche
     * (nom/e-mail/agence), statut (actif / inactif / invitation en attente) et
     * dernière connexion dans la période (jour/semaine/mois).
     */
    private function adminQuery(Request $request): Builder
    {
        $actor = $request->user();
        $agencyId = $this->resolvePressingScopedAgencyFilter($request, $actor);

        return User::query()
            ->where('pressing_id', $actor->pressing_id)
            ->when($request->filled('role'), function ($query) use ($request) {
                $roleId = Role::where('slug', $request->string('role')->value())->value('id');
                $query->where('role_id', $roleId);
            })
            ->when($agencyId !== null, fn ($query) => $query->where(fn ($q) => $q->where('agency_id', $agencyId)
                ->orWhereHas('extraAgencies', fn ($a) => $a->where('agencies.id', $agencyId))))
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.$request->string('search')->value().'%';
                $query->where(fn ($q) => $q->where('name', 'ilike', $term)
                    ->orWhere('email', 'ilike', $term)
                    ->orWhereHas('agency', fn ($a) => $a->where('name', 'ilike', $term)));
            })
            ->when($request->filled('status'), function ($query) use ($request) {
                match ($request->string('status')->value()) {
                    'active' => $query->where('is_active', true)->whereNull('invitation_expires_at'),
                    'inactive' => $query->where('is_active', false),
                    'pending' => $query->where('is_active', true)->whereNotNull('invitation_expires_at')->whereNull('last_login_at'),
                    default => null,
                };
            })
            ->when($request->filled('login_period'), function ($query) use ($request) {
                $since = match ($request->string('login_period')->value()) {
                    'week' => now()->startOfWeek(),
                    'month' => now()->startOfMonth(),
                    default => now()->startOfDay(),
                };
                $query->where('last_login_at', '>=', $since);
            });
    }

    /** KPI de l'écran Équipe, uniquement à partir de données réelles. */
    public function stats(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');
        $base = fn () => $this->adminQuery($request);

        $active = $base()->where('is_active', true)->count();
        $managerRoleIds = Role::whereIn('slug', ['manager', 'admin'])->pluck('id');
        $loginsToday = AuthEvent::query()
            ->where('type', 'login')
            ->where('created_at', '>=', now()->startOfDay())
            ->whereIn('user_id', $base()->select('id'))
            ->distinct('user_id')
            ->count('user_id');
        $pending = $base()->where('is_active', true)->whereNotNull('invitation_expires_at')->whereNull('last_login_at');

        return response()->json([
            'active_count' => $active,
            'new_this_month' => $base()->where('created_at', '>=', now()->startOfMonth())->count(),
            'managers_count' => $base()->where('is_active', true)->whereIn('role_id', $managerRoleIds)->count(),
            'multi_agency_count' => $base()->where('is_active', true)->where(fn ($q) => $q->whereNull('agency_id')->orHas('extraAgencies'))->count(),
            'pending_invitations' => (clone $pending)->count(),
            'invitations_expiring_soon' => (clone $pending)->where('invitation_expires_at', '<=', now()->addDay())->count(),
            'logins_today' => $loginsToday,
            'mfa_enabled_count' => $base()->where('is_active', true)->whereNotNull('mfa_enabled_at')->count(),
        ]);
    }

    /** Évènements de sécurité récents de l'équipe (journal des connexions). */
    public function activity(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');

        $events = AuthEvent::query()
            ->with('user:id,name', 'actor:id,name')
            ->where('pressing_id', $request->user()->pressing_id)
            ->whereIn('user_id', $this->adminQuery($request)->select('id'))
            ->where('created_at', '>=', now()->subHours($request->integer('hours', 24)))
            ->latest('created_at')
            ->limit($request->integer('limit', 20))
            ->get()
            ->map(fn (AuthEvent $e) => [
                'id' => $e->id,
                'type' => $e->type,
                'user' => $e->user ? ['id' => $e->user->id, 'name' => $e->user->name] : null,
                'actor' => $e->actor ? ['id' => $e->actor->id, 'name' => $e->actor->name] : null,
                'device' => UserAgent::describe($e->user_agent),
                'ip_address' => $e->ip_address,
                'meta' => $e->meta,
                'created_at' => $e->created_at,
            ]);

        return response()->json($events);
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
        $sendInvitation = $request->boolean('send_invitation', true);

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
            'mfa_required' => $request->boolean('mfa_required'),
            'job_title' => $data['job_title'] ?? null,
            'employee_number' => $data['employee_number'] ?? null,
            // Invitation : valable 72 h, levée à la première connexion réussie.
            'invitation_expires_at' => $sendInvitation ? now()->addHours(self::INVITATION_HOURS) : null,
        ]);
        $this->syncExtraAgencies($request, $user, $data['extra_agency_ids'] ?? []);

        if ($request->hasFile('photo')) {
            $user->update(['photo_path' => $request->file('photo')->store("users/{$user->id}", ['disk' => config('filesystems.default')])]);
        }

        // Invitation par e-mail en complément de l'affichage à l'écran (jamais en
        // remplacement — voir CLAUDE.md) : aucune passerelle SMS réelle n'existe, mais
        // l'e-mail est un canal réel ici (Notification + mail, même mécanisme que
        // LicenseExpiringNotification).
        if ($sendInvitation) {
            $user->notify(new \App\Notifications\UserInvitationNotification($temporaryPassword));
            AuthEvent::record('invitation_sent', $user, $request, [], $request->user());
        }

        return response()->json([
            ...$user->load('role', 'agency', 'extraAgencies:id,name')->toArray(),
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

        $previousRole = $user->role_id;
        $extra = $data['extra_agency_ids'] ?? null;
        unset($data['extra_agency_ids'], $data['send_invitation']);
        $user->update($data);
        if ($extra !== null) {
            $this->syncExtraAgencies($request, $user, $extra);
        }
        if ($previousRole !== $user->role_id) {
            AuthEvent::record('role_changed', $user, $request, ['role' => $user->role?->name], $request->user());
        }

        return response()->json($user->fresh()->load('role', 'agency', 'extraAgencies:id,name'));
    }

    /**
     * Affectations complémentaires : toutes dans le pressing et accessibles à l'acteur,
     * jamais l'agence principale elle-même, jamais pour un compte global (qui voit déjà tout).
     */
    private function syncExtraAgencies(Request $request, User $user, array $agencyIds): void
    {
        $ids = collect($agencyIds)->map(fn ($id) => (int) $id)->unique()
            ->reject(fn (int $id) => $id === $user->agency_id)->values();
        if ($user->agency_id === null) {
            $ids = collect();
        }
        foreach ($ids as $id) {
            $this->authorizeAgency($request->user(), $id);
        }

        $changes = $user->extraAgencies()->sync($ids->all());
        if (! empty($changes['attached']) || ! empty($changes['detached'])) {
            AuthEvent::record('agency_assigned', $user, $request, [
                'agencies' => \App\Models\Agency::whereIn('id', $ids)->pluck('name')->all(),
            ], $request->user());
        }
    }

    public function resendInvitation(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');
        $this->authorizeUserAccess($request, $user);
        if ($user->last_login_at !== null) {
            throw new HttpException(422, 'Ce membre s\'est déjà connecté : utilisez la réinitialisation du mot de passe.');
        }

        $temporaryPassword = Str::password(12);
        $user->update([
            'password' => Hash::make($temporaryPassword),
            'must_change_password' => true,
            'is_active' => true,
            'invitation_expires_at' => now()->addHours(self::INVITATION_HOURS),
        ]);
        $user->notify(new \App\Notifications\UserInvitationNotification($temporaryPassword));
        AuthEvent::record('invitation_sent', $user, $request, ['resend' => true], $request->user());

        return response()->json(['temporary_password' => $temporaryPassword, 'invitation_expires_at' => $user->invitation_expires_at]);
    }

    public function revokeInvitation(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');
        $this->authorizeUserAccess($request, $user);
        if ($user->last_login_at !== null) {
            throw new HttpException(422, 'Ce membre s\'est déjà connecté : désactivez plutôt son compte.');
        }

        $user->update(['is_active' => false, 'invitation_expires_at' => null]);
        $user->tokens()->delete();
        AuthEvent::record('invitation_revoked', $user, $request, [], $request->user());

        return response()->json(['message' => 'Invitation révoquée.']);
    }

    /**
     * Import CSV de membres (colonnes : nom, email, téléphone, rôle (slug), code agence).
     * Tout ou rien : la moindre ligne invalide annule l'import et renvoie les erreurs par ligne.
     */
    public function import(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'users.manage');
        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt', 'max:1024']]);

        $actor = $request->user();
        $rows = array_map(fn ($line) => str_getcsv($line, str_contains($line, ';') ? ';' : ','), file($request->file('file')->getRealPath(), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES));
        $header = array_map(fn ($h) => strtolower(trim($h)), array_shift($rows) ?? []);
        $expected = ['nom', 'email', 'telephone', 'role', 'agence'];
        if (array_slice($header, 0, 5) !== $expected) {
            throw ValidationException::withMessages(['file' => ['En-tête attendu : '.implode(';', $expected)]]);
        }

        $errors = [];
        $prepared = [];
        $seen = [];
        foreach ($rows as $index => $row) {
            $line = $index + 2;
            [$name, $email, $phone, $roleSlug, $agencyCode] = array_map('trim', array_pad($row, 5, ''));
            $role = Role::where('slug', $roleSlug)->first();
            $agency = $agencyCode !== '' ? \App\Models\Agency::where('pressing_id', $actor->pressing_id)->where('code', $agencyCode)->first() : null;

            if ($name === '') {
                $errors[] = ['row' => $line, 'field' => 'nom', 'message' => 'Nom obligatoire.'];
            }
            if (! filter_var($email, FILTER_VALIDATE_EMAIL) || User::where('email', $email)->exists() || isset($seen[strtolower($email)])) {
                $errors[] = ['row' => $line, 'field' => 'email', 'message' => 'E-mail invalide ou déjà utilisé.'];
            }
            if ($role === null) {
                $errors[] = ['row' => $line, 'field' => 'role', 'message' => "Rôle inconnu : {$roleSlug}."];
            }
            if ($role !== null && ! $role->isGlobal() && ($agency === null || ! $actor->canAccessAgency($agency->id))) {
                $errors[] = ['row' => $line, 'field' => 'agence', 'message' => "Agence introuvable ou hors de votre périmètre : {$agencyCode}."];
            }
            $seen[strtolower($email)] = true;
            $prepared[] = compact('name', 'email', 'phone', 'role', 'agency');
        }

        if ($errors !== []) {
            return response()->json(['message' => 'Import refusé : corrigez les lignes signalées.', 'errors' => $errors], 422);
        }

        $created = DB::transaction(function () use ($prepared, $actor, $request) {
            $count = 0;
            foreach ($prepared as $row) {
                $temporaryPassword = Str::password(12);
                $user = User::create([
                    'name' => $row['name'],
                    'email' => $row['email'],
                    'phone' => $row['phone'] ?: null,
                    'role_id' => $row['role']->id,
                    'agency_id' => $row['role']->isGlobal() ? null : $row['agency']->id,
                    'pressing_id' => $actor->pressing_id,
                    'is_active' => true,
                    'password' => Hash::make($temporaryPassword),
                    'must_change_password' => true,
                    'invitation_expires_at' => now()->addHours(self::INVITATION_HOURS),
                ]);
                $user->notify(new \App\Notifications\UserInvitationNotification($temporaryPassword));
                AuthEvent::record('invitation_sent', $user, $request, ['import' => true], $actor);
                $count++;
            }

            return $count;
        });

        return response()->json(['created' => $created], 201);
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

        $user->notify(new \App\Notifications\UserInvitationNotification($temporaryPassword));

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
