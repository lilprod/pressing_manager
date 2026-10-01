<?php

namespace App\Services;

use App\Models\Service;
use App\Models\ServicePriceHistory;
use App\Models\ServicePriceTier;
use App\Models\TreatmentType;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Centralise la création/modification d'un article (Service) et de sa grille de
 * prix au kilo, avec historisation des changements de tarif. N'affecte jamais une
 * facture déjà émise : order_items.unit_price est un instantané pris à la création
 * du dépôt (voir OrderController::store), jamais recalculé depuis le tarif courant.
 */
class ServicePricingService
{
    public function createService(array $data, ?User $actor): Service
    {
        return DB::transaction(function () use ($data, $actor) {
            $service = Service::create(Arr::except($data, ['price_tiers']));

            if (! empty($data['price_tiers'])) {
                $this->syncTiers($service, $data['price_tiers'], $actor);
            }

            return $service->fresh(['priceTiers']);
        });
    }

    public function updateService(Service $service, array $data, ?User $actor): Service
    {
        return DB::transaction(function () use ($service, $data, $actor) {
            if (array_key_exists('base_price', $data) && (int) $data['base_price'] !== $service->base_price) {
                $this->logHistory($service, 'base_price', (string) $service->base_price, (string) $data['base_price'], $actor);
            }

            $service->update(Arr::except($data, ['price_tiers']));

            if (array_key_exists('price_tiers', $data)) {
                $this->syncTiers($service, $data['price_tiers'], $actor);
            }

            return $service->fresh(['priceTiers']);
        });
    }

    public function resolveTier(Service $service, float $weightKg): ?ServicePriceTier
    {
        return $service->priceTiers()
            ->where('weight_min', '<=', $weightKg)
            ->where(fn ($q) => $q->whereNull('weight_max')->orWhere('weight_max', '>=', $weightKg))
            ->first();
    }

    public function roundAmount(Service $service, int $amount): int
    {
        if (! $service->round_to_hundred) {
            return $amount;
        }

        return (int) (round($amount / 100) * 100);
    }

    /**
     * Applique le ratio de prix d'un traitement (CDC §11.1-11.3, ex. Express = Classique × 1,5)
     * au montant déjà calculé pour l'article (prix pièce ou grille au kilo).
     */
    public function applyTreatmentRatio(int $amount, TreatmentType $treatmentType): int
    {
        return (int) round($amount * $treatmentType->price_ratio);
    }

    /** @param  array<int, array{weight_min: float, weight_max: float|null, price_per_kg: int}>  $tiers */
    private function syncTiers(Service $service, array $tiers, ?User $actor): void
    {
        $describe = fn ($t) => sprintf('%s-%s kg: %s', $t['weight_min'], $t['weight_max'] ?? '∞', $t['price_per_kg']);

        $old = $service->priceTiers()->get()
            ->map(fn (ServicePriceTier $t) => $describe(['weight_min' => $t->weight_min, 'weight_max' => $t->weight_max, 'price_per_kg' => $t->price_per_kg]))
            ->implode(', ');

        $service->priceTiers()->delete();
        foreach ($tiers as $tier) {
            ServicePriceTier::create([
                'service_id' => $service->id,
                'weight_min' => $tier['weight_min'],
                'weight_max' => $tier['weight_max'] ?? null,
                'price_per_kg' => $tier['price_per_kg'],
            ]);
        }

        $new = collect($tiers)->map($describe)->implode(', ');

        if ($old !== $new) {
            $this->logHistory($service, 'price_tiers', $old ?: null, $new ?: null, $actor);
        }
    }

    private function logHistory(Service $service, string $field, ?string $old, ?string $new, ?User $actor): void
    {
        ServicePriceHistory::create([
            'service_id' => $service->id,
            'field' => $field,
            'old_value' => $old,
            'new_value' => $new,
            'changed_by' => $actor?->id,
            'changed_at' => now(),
        ]);
    }
}
