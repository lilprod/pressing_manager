<?php

namespace App\Http\Controllers\Api;

use App\Models\License;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Lecture seule côté tenant depuis l'harmonisation licence/plateforme (voir CLAUDE.md
 * « Licence / facturation — gap d'harmonisation ») : le renouvellement et la gestion
 * des plans sont désormais des actions plateforme exclusives (Spark), jamais une
 * permission tenant — un manager de pressing ne peut plus fixer son propre prix ni
 * débloquer (ou bloquer) les autres pressings du déploiement partagé en renouvelant
 * une ligne qui leur était auparavant commune. Visible sans permission particulière :
 * un statut + un historique de paiements ne sont pas sensibles et aucune action n'y
 * est plus rattachée.
 */
class LicenseController extends ApiController
{
    public function show(Request $request): JsonResponse
    {
        $license = License::current($request->user()->pressing_id)->refreshStatus();

        return response()->json([
            ...$license->toArray(),
            'grace_ends_at' => $license->graceEndsAt(),
            'days_remaining' => (int) now()->diffInDays($license->expires_at, false),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $license = License::current($request->user()->pressing_id);

        return response()->json($license->payments()->latest('paid_at')->get());
    }
}
