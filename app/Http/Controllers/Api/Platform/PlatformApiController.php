<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Controllers\Controller;
use App\Models\PlatformUser;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Mirrors App\Http\Controllers\Api\ApiController (tenant) pour le royaume plateforme. */
abstract class PlatformApiController extends Controller
{
    protected function authorizePermission(PlatformUser $user, string $permission): void
    {
        if (! $user->hasPermission($permission)) {
            throw new HttpException(403, "Permission manquante : {$permission}.");
        }
    }

    /** 403 si l'utilisateur n'est pas superadmin et n'est pas affecté à ce pressing. */
    protected function authorizePressing(PlatformUser $user, int $pressingId): void
    {
        if (! $user->canAccessPressing($pressingId)) {
            throw new HttpException(403, "Vous n'avez pas accès à ce pressing.");
        }
    }

    /** Liste des ids de pressings affectés, ou null pour un superadmin (= pas de restriction). */
    protected function resolvePressingFilter(PlatformUser $user): ?array
    {
        if ($user->isSuperadmin()) {
            return null;
        }

        return $user->pressings()->pluck('pressings.id')->all();
    }
}
