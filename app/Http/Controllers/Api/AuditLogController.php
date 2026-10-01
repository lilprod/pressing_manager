<?php

namespace App\Http\Controllers\Api;

use App\Models\AuditLog;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Delivery;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class AuditLogController extends ApiController
{
    /** Types journalisables exposables côté client (slug court -> classe Eloquent). */
    private const TYPES = [
        'order' => Order::class,
        'order_item' => OrderItem::class,
        'client' => Client::class,
        'payment' => Payment::class,
        'invoice' => Invoice::class,
        'delivery' => Delivery::class,
        'cash_movement' => CashMovement::class,
        'cash_closure' => CashClosure::class,
        'stock_movement' => StockMovement::class,
    ];

    /** Journal d'audit global (écran « Audit & logs »). */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'audit.view');
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $logs = AuditLog::query()
            ->with('user')
            ->whereIn('agency_id', $agencyId)
            ->when($request->filled('type'), fn ($q) => $q->where('auditable_type', self::TYPES[$request->string('type')->value()] ?? '__none__'))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->date('to')))
            ->latest('created_at')
            ->paginate($request->integer('per_page', 30));

        $logs->getCollection()->transform(fn (AuditLog $log) => $this->decorate($log));

        return response()->json($logs);
    }

    /** Journal d'audit scopé à un dépôt : la commande, ses articles, sa facture, ses paiements. */
    public function forOrder(Request $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        $order->loadMissing('items', 'invoice.payments');

        $pairs = new Collection([[Order::class, [$order->id]]]);
        if ($order->items->isNotEmpty()) {
            $pairs->push([OrderItem::class, $order->items->pluck('id')->all()]);
        }
        if ($order->invoice->isNotEmpty()) {
            $pairs->push([Invoice::class, $order->invoice->pluck('id')->all()]);
            $paymentIds = $order->invoice->flatMap->payments->pluck('id');
            if ($paymentIds->isNotEmpty()) {
                $pairs->push([Payment::class, $paymentIds->all()]);
            }
        }

        $logs = AuditLog::query()
            ->with('user')
            ->where(function ($query) use ($pairs) {
                foreach ($pairs as [$type, $ids]) {
                    $query->orWhere(fn ($q) => $q->where('auditable_type', $type)->whereIn('auditable_id', $ids));
                }
            })
            ->latest('created_at')
            ->limit(100)
            ->get();

        return response()->json($logs->map(fn (AuditLog $log) => $this->decorate($log)));
    }

    private function decorate(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'action' => $log->action,
            'auditable_type' => class_basename($log->auditable_type),
            'auditable_id' => $log->auditable_id,
            'old_values' => $log->old_values,
            'new_values' => $log->new_values,
            'user' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
            'created_at' => $log->created_at,
        ];
    }
}
