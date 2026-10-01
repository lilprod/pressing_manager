<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Order\StoreOrderRequest;
use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\CustomerSubscription;
use App\Models\OrderSyncLog;
use App\Models\Payment;
use App\Services\OrderNumberGenerator;
use App\Services\QrCodeGenerator;
use App\Services\ServicePricingService;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderController extends ApiController
{
    public function __construct(
        private readonly OrderNumberGenerator $orderNumbers,
        private readonly QrCodeGenerator $qrCodes,
        private readonly SubscriptionService $subscriptions,
        private readonly ServicePricingService $pricing,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $orders = Order::query()
            ->with('client', 'items')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')->value()))
            ->when($request->filled('client_id'), fn ($query) => $query->where('client_id', $request->integer('client_id')))
            ->when($request->boolean('ready_today'), fn ($query) => $query->whereDate('promised_at', now()->toDateString()))
            ->latest()
            ->paginate($request->integer('per_page', 20));

        return response()->json($orders);
    }

    /** KPI de la liste des dépôts, calculés uniquement à partir de données réelles. */
    public function stats(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $today = now()->toDateString();

        $todayCount = Order::query()
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->whereDate('created_at', $today)
            ->count();

        $todayRevenue = (int) Payment::query()
            ->where('status', 'complete')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->whereDate('paid_at', $today)
            ->sum('amount');

        $dueToday = Order::query()
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->whereDate('promised_at', $today)
            ->whereNotIn('status', ['livre', 'annule'])
            ->count();

        $outstandingBalance = (int) Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->withSum(['payments as paid_amount' => fn ($query) => $query->where('status', 'complete')], 'amount')
            ->get()
            ->sum(fn (Invoice $invoice) => max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0)));

        return response()->json([
            'today_count' => $todayCount,
            'today_revenue' => $todayRevenue,
            'due_today' => $dueToday,
            'outstanding_balance' => $outstandingBalance,
        ]);
    }

    #[OA\Post(
        path: '/orders',
        summary: "Crée une commande multi-articles (idempotent via client_local_uuid pour la réconciliation hors-ligne)",
        tags: ['Commandes'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 201, description: 'Commande créée'),
            new OA\Response(response: 200, description: 'Commande déjà synchronisée (rejouée par client_local_uuid)'),
            new OA\Response(response: 422, description: 'Client hors de l\'agence ou données invalides'),
        ]
    )]
    public function store(StoreOrderRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyId = $request->user()->agency_id ?? $data['agency_id'];

        // Idempotence : une commande créée hors-ligne déjà synchronisée n'est jamais dupliquée.
        if (! empty($data['client_local_uuid'])) {
            $existing = Order::where('client_local_uuid', $data['client_local_uuid'])->first();
            if ($existing !== null) {
                return response()->json($existing->load('items.intakeConditions'), 200);
            }
        }

        $client = Client::findOrFail($data['client_id']);
        if ($client->agency_id !== $agencyId) {
            throw new HttpException(422, "Le client n'appartient pas à cette agence.");
        }

        $agency = Agency::findOrFail($agencyId);

        $order = DB::transaction(function () use ($data, $agencyId, $agency, $request) {
            $order = Order::create([
                'agency_id' => $agencyId,
                'client_id' => $data['client_id'],
                'created_by' => $request->user()->id,
                'order_number' => $this->orderNumbers->next($agencyId),
                'client_local_uuid' => $data['client_local_uuid'] ?? null,
                'status' => 'recu',
                'is_express' => $data['is_express'] ?? false,
                // Priorité Kanban atelier par défaut : les dépôts express sont urgents à
                // la création, les autres démarrent normale. Ajustable ensuite par l'atelier
                // (client VIP, retard imminent) via AtelierController::updatePriority().
                'priority' => ($data['is_express'] ?? false) ? 'urgent' : 'normale',
                'source' => ! empty($data['client_local_uuid']) ? 'offline_sync' : 'comptoir',
                'sync_status' => 'synced',
                'promised_at' => $data['promised_at'] ?? null,
                'discount_amount' => $data['discount_amount'] ?? 0,
                'notes' => $data['notes'] ?? null,
            ]);

            $total = 0;
            $maxDurationHours = 0;
            foreach ($data['items'] as $itemData) {
                $service = $agency->services()->findOrFail($itemData['service_id']);
                $maxDurationHours = max($maxDurationHours, $service->estimated_duration_hours);

                $weightKg = $itemData['weight_kg'] ?? null;
                if ($weightKg !== null) {
                    if (! in_array($service->billing_mode, ['kg', 'mixte'], true)) {
                        throw new HttpException(422, "« {$service->name} » n'est pas facturable au kilo.");
                    }

                    $tier = $this->pricing->resolveTier($service, (float) $weightKg);
                    if ($tier === null) {
                        throw new HttpException(422, "Aucune grille de prix ne couvre {$weightKg} kg pour « {$service->name} ».");
                    }

                    // Un dépôt au kilo est traité comme un seul lot (quantity = 1) : le
                    // retrait partiel par quantité n'a pas de sens pour un poids global.
                    $quantity = 1;
                    $unitPrice = $this->pricing->roundAmount($service, (int) round($tier->price_per_kg * $weightKg));
                } else {
                    $quantity = $itemData['quantity'];
                    $unitPrice = $service->pivot->price_override ?? $service->base_price;
                }

                $item = $order->items()->create([
                    'agency_id' => $agencyId,
                    'service_id' => $service->id,
                    'qr_code' => $this->qrCodes->generateCode($agency->code),
                    'description' => $itemData['description'] ?? null,
                    'intake_notes' => $itemData['intake_notes'] ?? null,
                    'quantity' => $quantity,
                    'weight_kg' => $weightKg,
                    'unit_price' => $unitPrice,
                    'status' => 'recu',
                ]);

                if (! empty($itemData['intake_condition_ids'])) {
                    $item->intakeConditions()->sync($itemData['intake_condition_ids']);
                }

                $total += $unitPrice * $quantity;
            }

            $order->total_amount = $total;
            if ($order->promised_at === null) {
                $order->promised_at = now()->addHours($maxDurationHours);
            }
            $order->save();

            $activeSubscription = CustomerSubscription::where('client_id', $data['client_id'])
                ->where('agency_id', $agencyId)
                ->where('status', 'active')
                ->where('expires_at', '>', now())
                ->first();

            if ($activeSubscription !== null) {
                $itemsCount = array_sum(array_column($data['items'], 'quantity'));
                $this->subscriptions->consumeQuota($activeSubscription, $itemsCount);
            }

            if (! empty($data['client_local_uuid'])) {
                OrderSyncLog::create([
                    'order_id' => $order->id,
                    'client_local_uuid' => $data['client_local_uuid'],
                    'conflict_type' => 'aucun',
                    'synced_at' => now(),
                ]);
            }

            return $order;
        });

        return response()->json($order->load('items.intakeConditions'), 201);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        $order->load(
            'items.service', 'items.intakeConditions', 'items.statusHistories.actor',
            'client', 'invoice.payments', 'agency', 'pickups.items.orderItem', 'pickups.processor', 'creator',
            'washer', 'sorter',
        );
        $order->setAttribute('balance_due', $this->balanceDue($order));

        return response()->json($order);
    }

    private function balanceDue(Order $order): int
    {
        return (int) $order->invoice->sum(function ($invoice) {
            $paid = $invoice->payments->where('status', 'complete')->sum('amount');

            return max(0, $invoice->total_amount - $paid);
        });
    }
}
