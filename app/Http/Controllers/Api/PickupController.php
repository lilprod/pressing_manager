<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Pickup\StoreOrderPickupRequest;
use App\Models\NotificationLog;
use App\Models\Order;
use App\Models\OrderPickup;
use App\Services\PickupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PickupController extends ApiController
{
    public function __construct(private readonly PickupService $pickups) {}

    /** Liste des dépôts prêts à être remis (Centre de retrait). */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'orders.manage');
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $orders = Order::query()
            ->where('status', 'pret')
            ->with(['client', 'items' => fn ($q) => $q->whereIn('status', ['pret', 'non_recupere']), 'invoice.payments'])
            ->whereIn('agency_id', $agencyId)
            ->when($request->filled('q'), function ($query) use ($request) {
                $term = $request->string('q')->value();
                $query->whereHas('client', fn ($c) => $c->where('first_name', 'ilike', "%{$term}%")
                    ->orWhere('last_name', 'ilike', "%{$term}%")
                    ->orWhere('phone', 'ilike', "%{$term}%"));
            })
            ->when($request->filled('promised_from'), fn ($query) => $query->whereDate('promised_at', '>=', $request->date('promised_from')))
            ->when($request->filled('promised_to'), fn ($query) => $query->whereDate('promised_at', '<=', $request->date('promised_to')))
            ->when(
                $request->filled('item_status') && in_array($request->string('item_status')->value(), ['pret', 'non_recupere'], true),
                fn ($query) => $query->whereHas('items', fn ($q) => $q->where('status', $request->string('item_status')->value()))
            )
            ->orderBy('promised_at')
            ->paginate($request->integer('per_page', 20));

        $orders->getCollection()->transform(fn (Order $order) => $this->decorate($order));

        return response()->json($orders);
    }

    /** KPI du Centre de retrait, calculés uniquement à partir de données réelles. */
    public function summary(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'orders.manage');
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $readyOrders = Order::query()
            ->where('status', 'pret')
            ->with('items', 'invoice.payments')
            ->whereIn('agency_id', $agencyId)
            ->get();

        $piecesReady = $readyOrders->sum(fn (Order $order) => $order->items
            ->whereIn('status', ['pret', 'non_recupere'])
            ->sum(fn ($item) => $item->quantity - $item->quantity_delivered));

        $awaitingNotification = $readyOrders->filter(function (Order $order) {
            $log = NotificationLog::where('order_id', $order->id)->where('event', 'order_ready')->latest('sent_at')->first();

            return $log === null || $log->status !== 'sent';
        })->count();

        $unpaid = $readyOrders->filter(fn (Order $order) => $this->balanceDue($order) > 0);

        $pickupsToday = OrderPickup::query()
            ->whereIn('agency_id', $agencyId)
            ->whereDate('processed_at', now()->toDateString())
            ->count();

        $dueToday = $readyOrders
            ->filter(fn (Order $order) => $order->promised_at && $order->promised_at->isToday())
            ->sortBy('promised_at')
            ->values()
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'client_name' => trim(($order->client->first_name ?? '').' '.($order->client->last_name ?? '')),
                'promised_at' => $order->promised_at,
                'pieces_remaining' => $order->items->whereIn('status', ['pret', 'non_recupere'])->sum(fn ($item) => $item->quantity - $item->quantity_delivered),
                'balance_due' => $this->balanceDue($order),
            ]);

        return response()->json([
            'ready_orders' => $readyOrders->count(),
            'pieces_ready' => $piecesReady,
            'awaiting_notification' => $awaitingNotification,
            'pickups_today' => $pickupsToday,
            'unpaid_orders' => $unpaid->count(),
            'unpaid_amount' => $unpaid->sum(fn (Order $order) => $this->balanceDue($order)),
            'due_today' => $dueToday,
        ]);
    }

    public function store(StoreOrderPickupRequest $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        $pickup = $this->pickups->process($order, $request->validated(), $request->user());

        return response()->json($pickup, 201);
    }

    private function decorate(Order $order): Order
    {
        $order->setAttribute('balance_due', $this->balanceDue($order));
        $order->setAttribute('pieces_remaining', $order->items->sum(fn ($item) => $item->quantity - $item->quantity_delivered));

        $log = NotificationLog::where('order_id', $order->id)->where('event', 'order_ready')->latest('sent_at')->first();
        $order->setAttribute('notification_status', $log?->status);

        return $order;
    }

    private function balanceDue(Order $order): int
    {
        return (int) $order->invoice->sum(function ($invoice) {
            $paid = $invoice->payments->where('status', 'complete')->sum('amount');

            return max(0, $invoice->total_amount - $paid);
        });
    }
}
