<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Order\StoreOrderRequest;
use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderSyncLog;
use App\Services\OrderNumberGenerator;
use App\Services\QrCodeGenerator;
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
    ) {}

    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $orders = Order::query()
            ->with('client', 'items')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')->value()))
            ->when($request->filled('client_id'), fn ($query) => $query->where('client_id', $request->integer('client_id')))
            ->latest()
            ->paginate($request->integer('per_page', 20));

        return response()->json($orders);
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
                return response()->json($existing->load('items'), 200);
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
                'source' => ! empty($data['client_local_uuid']) ? 'offline_sync' : 'comptoir',
                'sync_status' => 'synced',
                'promised_at' => $data['promised_at'] ?? null,
                'discount_amount' => $data['discount_amount'] ?? 0,
                'notes' => $data['notes'] ?? null,
            ]);

            $total = 0;
            foreach ($data['items'] as $itemData) {
                $service = $agency->services()->findOrFail($itemData['service_id']);
                $unitPrice = $service->pivot->price_override ?? $service->base_price;

                $order->items()->create([
                    'agency_id' => $agencyId,
                    'service_id' => $service->id,
                    'qr_code' => $this->qrCodes->generateCode($agency->code),
                    'description' => $itemData['description'] ?? null,
                    'quantity' => $itemData['quantity'],
                    'unit_price' => $unitPrice,
                    'status' => 'recu',
                ]);

                $total += $unitPrice * $itemData['quantity'];
            }

            $order->total_amount = $total;
            $order->save();

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

        return response()->json($order->load('items'), 201);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        return response()->json($order->load('items.service', 'client', 'invoice'));
    }
}
