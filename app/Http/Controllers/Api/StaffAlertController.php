<?php

namespace App\Http\Controllers\Api;

use App\Models\CashMovement;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Cloche d'alertes (en-tête) : agrège en live deux signaux déjà réels mais
 * jusqu'ici isolés par écran — mouvements de caisse en attente de validation
 * (déjà la bannière de blocage de CashRegisterPage.tsx) et retraits bloqués
 * pour impayé (déjà le filtre `unpaid` de PickupController::summary()). Pas de
 * nouvelle table : un flux minimal réel, pas un système de notification
 * générique. Voir CLAUDE.md, audit Figma 2026-10-06.
 */
class StaffAlertController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $agencyIds = $this->resolveAgencyFilter($request, $user);
        $alerts = [];

        if ($user->hasPermission('payments.manage')) {
            $pendingMovements = CashMovement::query()
                ->whereIn('agency_id', $agencyIds)
                ->where('status', 'en_attente')
                ->count();

            if ($pendingMovements > 0) {
                // Pas de libellé rendu côté serveur : l'i18n de cette app est entièrement
                // frontend (fr.json/en.json) — seuls `type`/`count` voyagent, le frontend
                // compose le texte via sa propre clé `alerts.{type}`.
                $alerts[] = [
                    'type' => 'cash_movement_pending',
                    'count' => $pendingMovements,
                    'url' => '/cash',
                ];
            }
        }

        if ($user->hasPermission('orders.manage')) {
            // Même formule que PickupController::balanceDue() (facture(s) du dépôt,
            // somme des paiements complets soustraite au total) — dupliquée ici car
            // bornée à 2-3 lignes, pas assez pour justifier un service partagé.
            $blockedPickups = Order::query()
                ->where('status', 'pret')
                ->whereIn('agency_id', $agencyIds)
                ->with('invoice.payments')
                ->get()
                ->filter(function (Order $order) {
                    $balanceDue = (int) $order->invoice->sum(function ($invoice) {
                        $paid = $invoice->payments->where('status', 'complete')->sum('amount');

                        return max(0, $invoice->total_amount - $paid);
                    });

                    return $balanceDue > 0;
                })
                ->count();

            if ($blockedPickups > 0) {
                $alerts[] = [
                    'type' => 'pickup_blocked',
                    'count' => $blockedPickups,
                    'url' => '/pickups',
                ];
            }
        }

        return response()->json([
            'alerts' => $alerts,
            'total' => array_sum(array_column($alerts, 'count')),
        ]);
    }
}
