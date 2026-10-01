<?php

namespace App\Http\Middleware;

use App\Models\Pressing;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Troisième royaume d'authentification, distinct de Sanctum (tenant et plateforme) :
 * un pressing n'est pas un "utilisateur", c'est un déploiement qui s'auto-rapporte via
 * un jeton dédié (voir Pressing::generateReportToken()/findByReportToken()).
 */
class VerifyPressingReportToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if ($token === null) {
            throw new HttpException(401, 'Jeton de rapport manquant.');
        }

        $pressing = Pressing::findByReportToken($token);

        if ($pressing === null) {
            throw new HttpException(401, 'Jeton de rapport invalide.');
        }

        $pressing->forceFill(['report_token_last_used_at' => now()])->save();

        $request->attributes->set('pressing', $pressing);

        return $next($request);
    }
}
