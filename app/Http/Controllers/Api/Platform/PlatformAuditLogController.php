<?php

namespace App\Http\Controllers\Api\Platform;

use App\Models\PlatformAuditLog;
use App\Models\PlatformUser;
use App\Models\Pressing;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Phase 3 (observabilité) — écran « Audit global » jusqu'ici absent malgré un
 * mécanisme de journalisation déjà en place et déjà alimenté depuis la Phase 1
 * (`PlatformAuditLog`/`PlatformAuditable`). Mirrors `AuditLogController` tenant.
 *
 * Chantier « Re-audit Pressing détail » (CLAUDE.md) : enrichi de sous-catégories
 * (sécurité/configuration), recherche, et export CSV/PDF — pour la vue à un seul
 * pressing uniquement (jamais un export sans borne sur tout le journal plateforme).
 */
class PlatformAuditLogController extends PlatformApiController
{
    private const TYPES = [
        'pressing' => Pressing::class,
        'platform_user' => PlatformUser::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');

        $query = $this->filteredQuery($request, $user);

        return response()->json($query->paginate($request->integer('per_page', 25)));
    }

    /**
     * CSV en flux direct (fputcsv, aucune dépendance — ce projet n'a encore jamais
     * eu besoin de CSV, seulement Excel/PDF, donc pas de patron existant à copier).
     * `pressing_id` obligatoire : jamais un export sans borne sur tout le journal.
     */
    public function exportCsv(Request $request): StreamedResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $pressingId = $this->requirePressingIdForExport($request, $user);

        $rows = $this->filteredQuery($request, $user)->get();

        return new StreamedResponse(function () use ($rows) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Date', 'Action', 'Acteur', 'Rôle', 'Adresse IP']);
            foreach ($rows as $log) {
                fputcsv($handle, [
                    $log->created_at?->format('d/m/Y H:i:s'),
                    $log->action,
                    $log->platformUser?->name ?? 'Système',
                    $log->platformUser?->platformRole?->name ?? '—',
                    $log->ip_address ?? '—',
                ]);
            }
            fclose($handle);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"audit-pressing-{$pressingId}.csv\"",
        ]);
    }

    public function exportPdf(Request $request): SymfonyResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $pressingId = $this->requirePressingIdForExport($request, $user);

        $rows = $this->filteredQuery($request, $user)->get();
        $pressing = Pressing::findOrFail($pressingId);

        return Pdf::loadView('platform.audit-pdf', ['rows' => $rows, 'pressing' => $pressing])
            ->download("audit-pressing-{$pressingId}.pdf");
    }

    private function filteredQuery(Request $request, PlatformUser $user): Builder
    {
        $query = PlatformAuditLog::query()->with('platformUser.platformRole')->latest('created_at');

        if ($type = $request->string('type')->toString()) {
            if (! array_key_exists($type, self::TYPES)) {
                throw new HttpException(422, 'Type inconnu.');
            }
            $query->where('auditable_type', self::TYPES[$type]);
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->date('from'));
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->date('to')->endOfDay());
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function (Builder $q) use ($search) {
                $q->where('action', 'ilike', "%{$search}%")
                    ->orWhereHas('platformUser', fn (Builder $pu) => $pu->where('name', 'ilike', "%{$search}%"));
            });
        }

        // Filtre explicite sur un seul pressing (fiche détail) — autorisation vérifiée
        // explicitement : un utilisateur transverse non affecté ne doit pas pouvoir lire
        // l'audit d'un pressing hors de son périmètre en passant juste ce paramètre.
        if ($request->filled('pressing_id')) {
            $pressingId = $request->integer('pressing_id');
            $this->authorizePressing($user, $pressingId);
            $query->where('auditable_type', Pressing::class)->where('auditable_id', $pressingId);

            // Sous-catégorisation propre à la vue d'un seul pressing — aucune catégorie
            // « succès/échec » (une action plateforme qui échoue lève une exception
            // HTTP, jamais journalisée) ni « impressions »/« synchronisation offline »
            // (concepts côté appareil/tenant, aucune entrée PlatformAuditLog ne peut
            // jamais s'y rattacher pour un pressing — deux onglets vides en permanence
            // seraient aussi trompeurs que d'en fabriquer le contenu, voir CLAUDE.md).
            if ($category = $request->string('category')->toString()) {
                if (! in_array($category, ['security', 'configuration'], true)) {
                    throw new HttpException(422, 'Catégorie inconnue.');
                }
                $isSecurity = function (Builder $q) {
                    $q->where('action', 'pressing.impersonated')
                        ->orWhere(function (Builder $q2) {
                            $q2->where('action', Pressing::class.'.updated')
                                ->where(function (Builder $q3) {
                                    $q3->whereRaw("new_values->>'status' IS NOT NULL")
                                        ->orWhereRaw("new_values->>'report_token_hash' IS NOT NULL");
                                });
                        });
                };
                if ($category === 'security') {
                    $query->where($isSecurity);
                } else {
                    $query->whereNot($isSecurity);
                }
            }
        } elseif (! $user->isSuperadmin()) {
            // Un non-superadmin ne voit que l'activité des pressings qui lui sont affectés
            // (même discipline que le reste du RBAC transverse) — jamais les entrées
            // relatives à d'autres membres du personnel Spark, réservées au superadmin.
            $pressingIds = $this->resolvePressingFilter($user) ?? [];
            $query->where('auditable_type', Pressing::class)->whereIn('auditable_id', $pressingIds);
        }

        return $query;
    }

    private function requirePressingIdForExport(Request $request, PlatformUser $user): int
    {
        if (! $request->filled('pressing_id')) {
            throw new HttpException(422, "Paramètre 'pressing_id' requis pour un export — jamais un export sans borne sur tout le journal.");
        }

        $pressingId = $request->integer('pressing_id');
        $this->authorizePressing($user, $pressingId);

        return $pressingId;
    }
}
