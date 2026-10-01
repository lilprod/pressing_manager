<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Pivot multi-tenant (CLAUDE.md) : le superadmin peut suspendre un pressing
 * (déjà existant côté plateforme, `PressingController::suspend`/`reactivate`) —
 * ce garde bloque alors l'accès opérationnel de ses utilisateurs tenant, mirrors
 * `CheckLicenseStatus` (même structure, statut différent : la licence logicielle
 * du déploiement reste un système séparé, voir CLAUDE.md « Pivot multi-tenant »
 * pour la distinction).
 */
class CheckPressingStatus
{
    private const ALWAYS_ALLOWED = ['api/logout', 'api/me'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is(self::ALWAYS_ALLOWED)) {
            return $next($request);
        }

        $user = $request->user();
        if ($user !== null && $user->pressing?->status === 'suspended') {
            throw new HttpException(403, 'Ce pressing est suspendu. Contactez votre administrateur Spark.');
        }

        return $next($request);
    }
}
