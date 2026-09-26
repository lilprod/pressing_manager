<?php

namespace App\Http\Middleware;

use App\Models\License;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Applique le comportement défini à l'étape 5 :
 * - active        : accès normal
 * - grace_period  : lecture seule (GET/HEAD/OPTIONS), écriture bloquée
 * - expired       : accès totalement bloqué
 * Toujours autorisé, quel que soit le statut : les routes /license* (pour
 * consulter le statut et renouveler), /logout (pour se déconnecter) et /me
 * (pour savoir qui est connecté et si l'utilisateur a le droit de renouveler).
 */
class CheckLicenseStatus
{
    private const ALWAYS_ALLOWED = ['api/license*', 'api/logout', 'api/me'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is(self::ALWAYS_ALLOWED)) {
            return $next($request);
        }

        $license = License::current();

        if ($license === null) {
            throw new HttpException(402, "Aucune licence configurée pour ce déploiement.");
        }

        $license->refreshStatus();

        if ($license->status === 'expired') {
            throw new HttpException(402, 'Licence expirée. Contactez un administrateur pour la renouveler.');
        }

        if ($license->status === 'grace_period' && ! $request->isMethodSafe()) {
            throw new HttpException(402, 'Licence en période de grâce : accès en lecture seule jusqu\'au renouvellement.');
        }

        return $next($request);
    }
}
