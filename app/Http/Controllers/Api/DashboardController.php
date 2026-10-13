<?php

namespace App\Http\Controllers\Api;

use App\Models\Client;
use App\Models\Invoice;
use App\Models\LoyaltyPointMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPickup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Agrégats propres au tableau de bord staff (capture Figma « Dashboard_Staff »,
 * audit du 2026-10-13). Ne regroupe que des calculs qui n'existaient nulle part
 * ailleurs — le chiffre d'affaires, la courbe de revenus, la ventilation de caisse
 * et le journal d'activité restent servis par leurs endpoints d'origine (/kpi,
 * /kpi/revenue-series, /cash/payment-breakdown, /audit-logs), jamais redérivés ici.
 */
class DashboardController extends ApiController
{
    /** Statuts « en cours » d'un dépôt (même définition que l'Atelier/MultiAgencyService). */
    private const ACTIVE_STATUSES = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret'];

    /** Statuts encore en traitement : un dépôt prêt n'est plus « en retard » côté atelier. */
    private const IN_PROGRESS_STATUSES = ['recu', 'trie', 'en_traitement', 'controle_qualite'];

    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'reports.view');
        $agencyIds = $this->resolveAgencyFilter($request, $user);

        $from = $request->filled('from') ? Carbon::parse($request->string('from')->value())->startOfDay() : now()->startOfDay();
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->value())->endOfDay() : now()->endOfDay();

        return response()->json([
            'pipeline' => $this->pipeline($agencyIds),
            'deadlines' => $this->deadlines($agencyIds),
            'aging' => $this->aging($agencyIds),
            'pieces_received' => (int) OrderItem::query()
                ->whereIn('agency_id', $agencyIds)
                ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->where('status', '!=', 'annule'))
                ->sum('quantity'),
            'pickups' => [
                'count' => OrderPickup::query()->whereIn('agency_id', $agencyIds)->whereBetween('processed_at', [$from, $to])->count(),
                'ready_orders' => Order::query()->whereIn('agency_id', $agencyIds)->where('status', 'pret')->count(),
            ],
            'loyalty' => $this->loyalty($agencyIds),
        ]);
    }

    /** Dépôts ET pièces par statut d'atelier (la maquette compte des pièces, pas seulement des dépôts). */
    private function pipeline(array $agencyIds): array
    {
        $orders = Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        // Pièces restant à remettre, par statut de l'article lui-même (un article déjà livré
        // d'un dépôt partiellement retiré ne compte plus).
        $pieces = OrderItem::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->whereHas('order', fn ($q) => $q->where('status', '!=', 'annule'))
            ->selectRaw('status, sum(quantity - quantity_delivered) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return collect(self::ACTIVE_STATUSES)->map(fn (string $status) => [
            'status' => $status,
            'orders' => (int) ($orders[$status] ?? 0),
            'pieces' => (int) ($pieces[$status] ?? 0),
        ])->all();
    }

    /** Dépôts dont la date promise approche (24 h) ou est dépassée, encore en traitement. */
    private function deadlines(array $agencyIds): array
    {
        $base = fn () => Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereIn('status', self::IN_PROGRESS_STATUSES)
            ->whereNotNull('promised_at');

        $approaching = $base()
            ->whereBetween('promised_at', [now(), now()->addDay()])
            ->with('agency.settings')
            ->orderBy('promised_at')
            ->get();

        return [
            'approaching_count' => $approaching->count(),
            'approaching' => $approaching->take(3)->map(fn (Order $order) => [
                'id' => $order->id,
                'order_number' => $order->agency->formatOrderNumber($order->order_number),
                'promised_at' => $order->promised_at,
            ])->values(),
            'overdue_count' => $base()->where('promised_at', '<', now())->count(),
            'due_today_count' => $base()->whereBetween('promised_at', [now()->startOfDay(), now()->endOfDay()])->count(),
        ];
    }

    /**
     * Impayés par ancienneté d'émission (issued_at). Même formule de solde que
     * OrderController::stats()/InvoiceController : total − paiements complets.
     */
    private function aging(array $agencyIds): array
    {
        $buckets = [
            '0_30' => ['amount' => 0, 'count' => 0],
            '31_89' => ['amount' => 0, 'count' => 0],
            '90_plus' => ['amount' => 0, 'count' => 0],
        ];

        Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->whereIn('agency_id', $agencyIds)
            ->withSum(['payments as paid_amount' => fn ($q) => $q->where('status', 'complete')], 'amount')
            ->get(['id', 'total_amount', 'issued_at', 'created_at'])
            ->each(function (Invoice $invoice) use (&$buckets) {
                $balance = max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0));
                if ($balance === 0) {
                    return;
                }
                $age = (int) Carbon::parse($invoice->issued_at ?? $invoice->created_at)->diffInDays(now());
                $key = $age <= 30 ? '0_30' : ($age < 90 ? '31_89' : '90_plus');
                $buckets[$key]['amount'] += $balance;
                $buckets[$key]['count']++;
            });

        return [
            'total' => array_sum(array_column($buckets, 'amount')),
            'count' => array_sum(array_column($buckets, 'count')),
            'buckets' => $buckets,
        ];
    }

    /**
     * Clients fidélité = clients actifs ayant un solde de points > 0. « Nouveaux ce
     * mois » = clients dont le tout premier mouvement de points date de ce mois.
     */
    private function loyalty(array $agencyIds): array
    {
        $members = Client::query()
            ->whereIn('agency_id', $agencyIds)
            ->where('is_active', true)
            ->where('loyalty_points', '>', 0)
            ->count();

        $newThisMonth = DB::query()
            ->fromSub(
                LoyaltyPointMovement::query()
                    ->join('clients', 'clients.id', '=', 'loyalty_point_movements.client_id')
                    ->whereIn('clients.agency_id', $agencyIds)
                    ->selectRaw('loyalty_point_movements.client_id, min(loyalty_point_movements.created_at) as first_at')
                    ->groupBy('loyalty_point_movements.client_id'),
                'firsts',
            )
            ->where('first_at', '>=', now()->startOfMonth())
            ->count();

        return ['members' => $members, 'new_this_month' => $newThisMonth];
    }
}
