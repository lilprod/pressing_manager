<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\StorePlatformUserRequest;
use App\Http\Requests\Platform\UpdatePlatformUserRequest;
use App\Models\PlatformAuditLog;
use App\Models\PlatformUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class PlatformUserController extends PlatformApiController
{
    public function stats(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'platform_users.manage');

        $total = PlatformUser::count();

        return response()->json([
            'total' => $total,
            'mfa_enabled_pct' => $total > 0 ? round((PlatformUser::whereNotNull('totp_enabled_at')->count() / $total) * 100, 1) : 0.0,
            'pending_setup_count' => PlatformUser::whereNull('totp_enabled_at')->count(),
            'suspended_count' => PlatformUser::where('is_active', false)->count(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'platform_users.manage');

        $query = PlatformUser::query()->with(['platformRole', 'pressings'])->orderBy('name');

        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($q) => $q->where('name', 'ilike', "%{$search}%")->orWhere('email', 'ilike', "%{$search}%"));
        }

        if ($request->filled('pressing_id')) {
            $query->whereHas('pressings', fn ($q) => $q->where('pressings.id', $request->integer('pressing_id')));
        }

        if ($request->filled('platform_role_id')) {
            $query->where('platform_role_id', $request->integer('platform_role_id'));
        }

        if ($request->string('status')->toString() === 'suspended') {
            $query->where('is_active', false);
        } elseif ($request->string('status')->toString() === 'active') {
            $query->where('is_active', true);
        }

        if ($request->string('security')->toString() === 'mfa_on') {
            $query->whereNotNull('totp_enabled_at');
        } elseif ($request->string('security')->toString() === 'mfa_off') {
            $query->whereNull('totp_enabled_at');
        }

        return response()->json($query->paginate(20));
    }

    public function store(StorePlatformUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $temporaryPassword = Str::password(12);

        $user = PlatformUser::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'platform_role_id' => $data['platform_role_id'],
            'password' => Hash::make($temporaryPassword),
            'is_active' => true,
        ]);

        $user->pressings()->sync($data['pressing_ids'] ?? []);

        // Invitation par e-mail en complément de l'affichage à l'écran (jamais en
        // remplacement — voir CLAUDE.md « Licence / facturation — gap d'harmonisation »
        // §4, Phase 4).
        $user->notify(new \App\Notifications\PlatformUserInvitationNotification($temporaryPassword));

        return response()->json(
            $user->fresh(['platformRole', 'pressings'])->toArray() + ['temporary_password' => $temporaryPassword],
            201
        );
    }

    public function update(UpdatePlatformUserRequest $request, PlatformUser $platformUser): JsonResponse
    {
        $data = $request->validated();
        $actor = $request->user();

        // Les changements de nom/e-mail/rôle/statut sont déjà journalisés automatiquement par
        // le trait PlatformAuditable (hook `updated`) — pas besoin de les dupliquer ici.
        $platformUser->update(collect($data)->only(['name', 'email', 'platform_role_id', 'is_active'])->all());

        if (array_key_exists('pressing_ids', $data)) {
            $before = $platformUser->pressings()->pluck('pressings.id')->sort()->values()->all();
            $after = collect($data['pressing_ids'])->sort()->values()->all();
            if ($before !== $after) {
                $platformUser->pressings()->sync($data['pressing_ids']);
                $this->logActivity($actor, $platformUser, 'platform_user.assignment_changed', [
                    'from' => $before,
                    'to' => $after,
                ]);
            }
        }

        return response()->json($platformUser->fresh(['platformRole', 'pressings']));
    }

    /**
     * Réinitialisation admin (Phase 0, continuité de compte) — mirrors le mot de passe
     * temporaire affiché une seule fois à la création (UserController tenant a le même
     * patron). Avant cette méthode, un platform_user qui perdait son mot de passe était
     * définitivement bloqué : aucun champ `password` n'était accepté par UpdatePlatformUserRequest.
     */
    public function resetPassword(Request $request, PlatformUser $platformUser): JsonResponse
    {
        $this->authorizePermission($request->user(), 'platform_users.manage');

        $temporaryPassword = Str::password(12);

        $platformUser->update([
            'password' => Hash::make($temporaryPassword),
            'must_change_password' => true,
        ]);

        $platformUser->notify(new \App\Notifications\PlatformUserInvitationNotification($temporaryPassword));
        $this->logActivity($request->user(), $platformUser, 'platform_user.password_reset', []);

        return response()->json(['temporary_password' => $temporaryPassword]);
    }

    public function activity(Request $request, PlatformUser $platformUser): JsonResponse
    {
        $this->authorizePermission($request->user(), 'platform_users.manage');

        $logs = PlatformAuditLog::where('auditable_type', PlatformUser::class)
            ->where('auditable_id', $platformUser->id)
            ->with('platformUser')
            ->latest('created_at')
            ->limit(50)
            ->get();

        return response()->json($logs);
    }

    private function logActivity(PlatformUser $actor, PlatformUser $target, string $action, array $values): void
    {
        PlatformAuditLog::create([
            'platform_user_id' => $actor->id,
            'action' => $action,
            'auditable_type' => PlatformUser::class,
            'auditable_id' => $target->id,
            'new_values' => $values,
        ]);
    }
}
