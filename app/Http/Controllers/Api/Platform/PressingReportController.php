<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Controllers\Controller;
use App\Models\Pressing;
use App\Models\PressingReportLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Point d'ingestion appelé périodiquement par le job de chaque déploiement tenant
 * (authentifié par VerifyPressingReportToken, pas Sanctum — un pressing n'est pas un
 * "utilisateur"). Pas de requête live vers la base du client : le déploiement pousse
 * lui-même ses compteurs.
 */
class PressingReportController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        /** @var Pressing $pressing */
        $pressing = $request->attributes->get('pressing');

        $data = $request->validate([
            'agencies_count' => ['required', 'integer', 'min:0'],
            'active_users_count' => ['required', 'integer', 'min:0'],
            'operations_count' => ['required', 'integer', 'min:0'],
            'period_started_at' => ['required', 'date'],
            'period_ended_at' => ['required', 'date', 'after_or_equal:period_started_at'],
            'app_version' => ['nullable', 'string', 'max:40'],
        ]);

        PressingReportLog::create($data + [
            'pressing_id' => $pressing->id,
            'ip_address' => $request->ip(),
        ]);

        $pressing->forceFill([
            'agencies_count' => $data['agencies_count'],
            'users_count' => $data['active_users_count'],
            'last_report_at' => now(),
        ])->save();

        return response()->json(['message' => 'Rapport enregistré.'], 201);
    }
}
