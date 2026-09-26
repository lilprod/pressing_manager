<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\OrderItemStatusHistory;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class PerformanceService
{
    /**
     * Agrège, pour chaque utilisateur agence de l'agence donnée, la présence sur la
     * période et un indicateur métier selon son rôle (articles traités pour un
     * technicien, livraisons effectuées pour un livreur).
     */
    public function forAgency(int $agencyId, Carbon $from, Carbon $to): Collection
    {
        return User::query()
            ->where('agency_id', $agencyId)
            ->where('is_active', true)
            ->with('role')
            ->orderBy('name')
            ->get()
            ->map(fn (User $user) => $this->forUser($user, $from, $to));
    }

    private function forUser(User $user, Carbon $from, Carbon $to): array
    {
        $attendances = Attendance::query()
            ->where('user_id', $user->id)
            ->whereBetween('created_at', [$from, $to])
            ->get();

        $hours = $attendances
            ->filter(fn (Attendance $a) => $a->clock_in && $a->clock_out)
            ->sum(fn (Attendance $a) => $a->clock_in->diffInMinutes($a->clock_out) / 60);

        $roleSlug = $user->role?->slug;

        return [
            'user_id' => $user->id,
            'name' => $user->name,
            'role' => $roleSlug,
            'present' => $attendances->where('status', 'present')->count(),
            'retard' => $attendances->where('status', 'retard')->count(),
            'absent' => $attendances->where('status', 'absent')->count(),
            'hours_worked' => round($hours, 1),
            'items_processed' => $roleSlug === 'technicien' ? $this->itemsProcessed($user, $from, $to) : null,
            'deliveries_completed' => $roleSlug === 'livreur' ? $this->deliveriesCompleted($user, $from, $to) : null,
        ];
    }

    private function itemsProcessed(User $user, Carbon $from, Carbon $to): int
    {
        return OrderItemStatusHistory::query()
            ->where('changed_by', $user->id)
            ->where('to_status', 'pret')
            ->whereBetween('changed_at', [$from, $to])
            ->count();
    }

    private function deliveriesCompleted(User $user, Carbon $from, Carbon $to): int
    {
        return Delivery::query()
            ->where('livreur_id', $user->id)
            ->where('status', 'livree')
            ->whereBetween('delivered_at', [$from, $to])
            ->count();
    }
}
