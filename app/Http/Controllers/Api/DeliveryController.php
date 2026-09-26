<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InvalidStatusTransitionException;
use App\Http\Requests\Delivery\AssignDeliveryRequest;
use App\Http\Requests\Delivery\CompleteDeliveryRequest;
use App\Http\Requests\Delivery\FailDeliveryRequest;
use App\Http\Requests\Delivery\StoreDeliveryRequest;
use App\Http\Requests\Delivery\UpdateDeliveryStatusRequest;
use App\Models\Delivery;
use App\Models\Order;
use App\Services\DeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class DeliveryController extends ApiController
{
    public function __construct(private readonly DeliveryService $deliveries) {}

    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $deliveries = Delivery::query()
            ->with('zone', 'livreur', 'order.client')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')->value()))
            ->when($request->boolean('mine'), fn ($query) => $query->where('livreur_id', $request->user()->id))
            ->latest()
            ->get();

        return response()->json($deliveries);
    }

    public function store(StoreDeliveryRequest $request): JsonResponse
    {
        $data = $request->validated();
        $order = Order::findOrFail($data['order_id']);
        $this->authorizeAgency($request->user(), $order->agency_id);

        $delivery = $this->deliveries->createForOrder(
            order: $order,
            address: $data['address'],
            phone: $data['phone'] ?? null,
            zoneId: $data['delivery_zone_id'] ?? null,
            livreurId: $data['livreur_id'] ?? null,
            fee: $data['fee'] ?? null,
            scheduledAt: $data['scheduled_at'] ?? null,
        );

        return response()->json($delivery->load('zone', 'livreur', 'order.client'), 201);
    }

    public function show(Request $request, Delivery $delivery): JsonResponse
    {
        $this->authorizeAgency($request->user(), $delivery->agency_id);

        return response()->json($delivery->load('zone', 'livreur', 'order.client'));
    }

    public function assign(AssignDeliveryRequest $request, Delivery $delivery): JsonResponse
    {
        $this->authorizeAgency($request->user(), $delivery->agency_id);

        return response()->json($this->deliveries->assign($delivery, $request->validated()['livreur_id'])->load('livreur'));
    }

    public function updateStatus(UpdateDeliveryStatusRequest $request, Delivery $delivery): JsonResponse
    {
        $this->authorizeAgency($request->user(), $delivery->agency_id);
        $this->authorizeAssignedLivreur($request, $delivery);

        try {
            $updated = $this->deliveries->transition($delivery, $request->validated()['status']);
        } catch (InvalidStatusTransitionException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($updated);
    }

    public function complete(CompleteDeliveryRequest $request, Delivery $delivery): JsonResponse
    {
        $this->authorizeAgency($request->user(), $delivery->agency_id);
        $this->authorizeAssignedLivreur($request, $delivery);

        $data = $request->validated();

        try {
            $updated = $this->deliveries->complete(
                $delivery,
                $data['photo'],
                $data['signature'],
                (float) $data['latitude'],
                (float) $data['longitude'],
                $data['notes'] ?? null,
            );
        } catch (InvalidStatusTransitionException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($updated);
    }

    public function fail(FailDeliveryRequest $request, Delivery $delivery): JsonResponse
    {
        $this->authorizeAgency($request->user(), $delivery->agency_id);
        $this->authorizeAssignedLivreur($request, $delivery);

        try {
            $updated = $this->deliveries->fail($delivery, $request->validated()['reason']);
        } catch (InvalidStatusTransitionException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($updated);
    }

    public function photo(Request $request, Delivery $delivery): StreamedResponse
    {
        return $this->streamProof($request, $delivery, $delivery->proof_photo_path);
    }

    public function signature(Request $request, Delivery $delivery): StreamedResponse
    {
        return $this->streamProof($request, $delivery, $delivery->signature_path);
    }

    private function streamProof(Request $request, Delivery $delivery, ?string $path): StreamedResponse
    {
        $this->authorizeAgency($request->user(), $delivery->agency_id);

        if ($path === null || ! Storage::disk(config('filesystems.default'))->exists($path)) {
            throw new HttpException(404, 'Fichier introuvable.');
        }

        return Storage::disk(config('filesystems.default'))->response($path);
    }

    /**
     * Un livreur (sans deliveries.manage) ne peut agir que sur ses propres livraisons ;
     * manager/admin gardent un droit de supervision sur toutes celles de leur agence.
     */
    private function authorizeAssignedLivreur(Request $request, Delivery $delivery): void
    {
        if ($request->user()->hasPermission('deliveries.manage')) {
            return;
        }

        if ($delivery->livreur_id !== $request->user()->id) {
            throw new HttpException(403, "Cette livraison n'est pas assignée à cet utilisateur.");
        }
    }
}
