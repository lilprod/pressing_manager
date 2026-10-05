<?php

namespace App\Http\Middleware;

use App\Models\License;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Pivot multi-tenant + harmonisation licence/plateforme (voir CLAUDE.md « Licence /
 * facturation — gap d'harmonisation ») : fusionne ce qui était deux middlewares
 * séparés (`CheckPressingStatus` + l'ancien `CheckLicenseStatus`, qui lisait une
 * licence unique deployment-wide — bloquait/débloquait tous les pressings à la fois,
 * un vrai trou d'isolation cross-tenant). Statut du pressing ET licence du pressing
 * sont désormais vérifiés dans le même garde, à partir de la même colonne d'autorité
 * (`$user->pressing`) :
 * - pressing suspendu (`status`) : accès totalement bloqué (403).
 * - licence expirée (`licenses.pressing_id`, scopée) : accès totalement bloqué (402).
 * - licence en période de grâce : lecture seule (GET/HEAD/OPTIONS), écriture bloquée.
 */
class CheckPressingStatus
{
    private const ALWAYS_ALLOWED = ['api/logout', 'api/me', 'api/license*'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is(self::ALWAYS_ALLOWED)) {
            return $next($request);
        }

        $user = $request->user();

        if ($user === null || $user->pressing === null) {
            return $next($request);
        }

        if ($user->pressing->status === 'suspended') {
            throw new HttpException(403, 'Ce pressing est suspendu. Contactez votre administrateur Spark.');
        }

        $license = License::current($user->pressing_id)->refreshStatus();

        if ($license->status === 'expired') {
            throw new HttpException(402, 'Licence expirée. Contactez votre administrateur Spark pour la renouveler.');
        }

        if ($license->status === 'grace_period' && ! $request->isMethodSafe()) {
            throw new HttpException(402, 'Licence en période de grâce : accès en lecture seule jusqu\'au renouvellement.');
        }

        return $next($request);
    }
}
