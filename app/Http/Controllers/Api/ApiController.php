<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
     * Agence effective pour une liste : imposée pour un utilisateur local,
     * filtrable via ?agency_id= pour un utilisateur global (null = toutes les agences).
     */
    protected function resolveAgencyFilter(Request $request, User $user): ?int
    {
        if ($user->agency_id !== null) {
            return $user->agency_id;
        }

        return $request->integer('agency_id') ?: null;
    }
}
