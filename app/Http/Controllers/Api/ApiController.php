<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

abstract class ApiController extends Controller
{
    /**
     * 403 si l'utilisateur n'a pas accès à cette agence (rôle global = accès à toutes les agences).
     */
    protected function authorizeAgency(User $user, int $agencyId): void
    {
        if (! $user->canAccessAgency($agencyId)) {
            throw new HttpException(403, "Vous n'avez pas accès à cette agence.");
        }
    }

    protected function authorizePermission(User $user, string $permission): void
    {
        if (! $user->hasPermission($permission)) {
            throw new HttpException(403, "Permission manquante : {$permission}.");
        }
    }

    /**
     * Agences effectives pour une liste : imposées pour un utilisateur local,
     * filtrables via ?agency_id= pour un utilisateur global, sinon toutes les
     * agences DE SON PRESSING (jamais toute la table — pivot multi-tenant, voir
     * CLAUDE.md : avant cette passe, « pas de filtre » signifiait littéralement
     * aucune restriction, ce qui exposait les autres pressings partageant cette
     * base). Toujours utiliser `->whereIn('agency_id', $agencyIds)`, jamais
     * `->when($agencyId, ...)` — un utilisateur global sans agence choisie doit
     * rester borné à son pressing, pas déboucher sur « aucun filtre ».
     *
     * @return array<int>
     */
    protected function resolveAgencyFilter(Request $request, User $user): array
    {
        if ($user->agency_id !== null) {
            return [$user->agency_id];
        }

        if ($request->filled('agency_id')) {
            $agencyId = $request->integer('agency_id');
            $this->authorizeAgency($user, $agencyId);

            return [$agencyId];
        }

        return Agency::where('pressing_id', $user->pressing_id)->pluck('id')->all();
    }
}
