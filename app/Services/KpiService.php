<?php

namespace App\Services;

use App\Models\Agency;
use App\Models\AgencyStockItem;
use App\Models\Attendance;
use App\Models\CustomerSubscription;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\Payment;
use App\Models\StockItem;
use App\Models\StockMovement;
use Illuminate\Support\Carbon;

class KpiService
{
    /**
     * agencyId null => vue consolidée multi-agences (totaux globaux + ventilation
     * par agence) ; agencyId fourni => vue d'une seule agence.
     */
    public function build(?int $agencyId, Carbon $from, Carbon $to): array
    {
        $header = [
            'scope' => $agencyId ? 'agency' : 'consolidated',
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ];

        if ($agencyId) {
            $agency = Agency::find($agencyId);

            return $header + ['agency' => $agency ? ['id' => $agency->id, 'name' => $agency->name] : null] + $this->metrics($agencyId, $from, $to);
        }

        $byAgency = Agency::query()->orderBy('name')->get()
            ->map(fn (Agency $a) => ['agency_id' => $a->id, 'agency_name' => $a->name] + $this->metrics($a->id, $from, $to))
            ->values()->all();

        return $header + $this->metrics(null, $from, $to) + ['by_agency' => $byAgency];
    }

    private function metrics(?int $agencyId, Carbon $from, Carbon $to): array
    {
        $orders = Order::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->whereBetween('created_at', [$from, $to]);
        $ordersCount = (clone $orders)->count();
        $expressCount = (clone $orders)->where('is_express', true)->count();
        $ordersTotal = (clone $orders)->sum('total_amount');

        $revenue = (int) Payment::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->where('status', 'complete')
            ->whereBetween('paid_at', [$from, $to])
            ->sum('amount');

        $movements = StockMovement::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->whereBetween('occurred_at', [$from, $to])
            ->count();

        $lowStock = $agencyId
            ? $this->lowStockCount($agencyId)
            : Agency::query()->get()->sum(fn (Agency $a) => $this->lowStockCount($a->id));

        $deliveries = Delivery::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->whereBetween('created_at', [$from, $to]);
        $deliveriesTotal = (clone $deliveries)->count();
        $deliveriesCompleted = (clone $deliveries)->where('status', 'livree')->count();
        $deliveriesFailed = (clone $deliveries)->where('status', 'echouee')->count();

        $attendances = Attendance::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $hoursWorked = $attendances
            ->filter(fn (Attendance $a) => $a->clock_in && $a->clock_out)
            ->sum(fn (Attendance $a) => $a->clock_in->diffInMinutes($a->clock_out) / 60);

        $activeSubscriptions = CustomerSubscription::query()
            ->when($agencyId, fn ($q) => $q->where('agency_id', $agencyId))
            ->where('status', 'active')
            ->count();

        return [
            'revenue' => $revenue,
            'orders_count' => $ordersCount,
            'average_order_value' => $ordersCount > 0 ? (int) round($ordersTotal / $ordersCount) : 0,
            'express_rate' => $ordersCount > 0 ? round($expressCount / $ordersCount * 100, 1) : 0.0,
            'low_stock_items' => $lowStock,
            'stock_movements' => $movements,
            'deliveries_total' => $deliveriesTotal,
            'deliveries_completed' => $deliveriesCompleted,
            'deliveries_failed' => $deliveriesFailed,
            'delivery_completion_rate' => $deliveriesTotal > 0 ? round($deliveriesCompleted / $deliveriesTotal * 100, 1) : 0.0,
            'attendance_present' => $attendances->where('status', 'present')->count(),
            'attendance_retard' => $attendances->where('status', 'retard')->count(),
            'attendance_absent' => $attendances->where('status', 'absent')->count(),
            'hours_worked' => round($hoursWorked, 1),
            'active_subscriptions' => $activeSubscriptions,
        ];
    }

    /** Même règle que StockController::index : quantité en main <= seuil de réapprovisionnement. */
    private function lowStockCount(int $agencyId): int
    {
        $levels = AgencyStockItem::where('agency_id', $agencyId)->get()->keyBy('stock_item_id');

        return StockItem::where('is_active', true)->get()->reduce(function (int $carry, StockItem $item) use ($levels) {
            $level = $levels->get($item->id);
            $quantity = $level->quantity_on_hand ?? 0;
            $threshold = $level?->reorder_threshold_override ?? $item->default_reorder_threshold;

            return $carry + ($quantity <= $threshold ? 1 : 0);
        }, 0);
    }
}
