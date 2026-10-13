<?php

namespace App\Services;

use App\Models\Agency;
use App\Models\Service;
use App\Models\ServicePriceHistory;
use App\Models\ServicePriceTier;
use App\Models\ServiceTreatmentPrice;
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
    /** Clés du payload qui ne sont pas des colonnes de `services`. */
    private const RELATION_KEYS = ['price_tiers', 'accepted_condition_ids', 'treatment_rates', 'finish_option_ids', 'associated_service_ids'];

    /**
     * Prix d'une ligne de dépôt — source unique de vérité, utilisée au comptoir
     * (OrderController::store) comme pour l'aperçu du catalogue.
     *
     * Pièce : prix explicite du traitement s'il est renseigné sur l'article, sinon
     * ratio du traitement appliqué au prix de base. Un prix local d'agence
     * (price_override) remplace le prix de base et s'applique proportionnellement à
     * un prix explicite (agence +5 % → Express +5 %).
     * Kilo : tranche résolue, prix au kilo explicite du traitement sur la tranche
     * s'il existe, sinon ratio — comportement inchangé quand rien n'est explicite.
     *
     * @return int|null null si aucune tranche ne couvre le poids
     */
    public function priceFor(Service $service, ?TreatmentType $treatment, ?int $agencyOverride, ?float $weightKg, int $quantity = 1): ?int
    {
        if ($weightKg !== null) {
            $tier = $this->resolveTier($service, $weightKg);
            if ($tier === null) {
                return null;
            }
            $explicit = $treatment !== null ? ($tier->treatment_prices[(string) $treatment->id] ?? null) : null;
            if ($explicit !== null) {
                return $this->roundAmount($service, (int) round(((int) $explicit) * $weightKg));
            }
            $amount = $this->roundAmount($service, (int) round($tier->price_per_kg * $weightKg));

            return $treatment !== null ? $this->roundAmount($service, $this->applyTreatmentRatio($amount, $treatment)) : $amount;
        }

        $base = $agencyOverride ?? (int) $service->base_price;
        if ($treatment === null) {
            return $base;
        }
        $explicit = $this->explicitPrice($service, $treatment);
        if ($explicit !== null) {
            $scaled = ($agencyOverride !== null && (int) $service->base_price > 0)
                ? (int) round($explicit * $agencyOverride / (int) $service->base_price)
                : $explicit;

            return $this->roundAmount($service, $scaled);
        }

        return $this->roundAmount($service, $this->applyTreatmentRatio($base, $treatment));
    }

    /** Délai de traitement d'un article pour un traitement (explicite, sinon délai de l'article). */
    public function delayFor(Service $service, ?TreatmentType $treatment): int
    {
        if ($treatment !== null) {
            $row = $service->relationLoaded('treatmentRates')
                ? $service->treatmentRates->firstWhere('treatment_type_id', $treatment->id)
                : $service->treatmentRates()->where('treatment_type_id', $treatment->id)->first();
            if ($row?->delay_hours) {
                return $row->delay_hours;
            }
        }

        return (int) $service->estimated_duration_hours;
    }

    private function explicitPrice(Service $service, TreatmentType $treatment): ?int
    {
        $row = $service->relationLoaded('treatmentRates')
            ? $service->treatmentRates->firstWhere('treatment_type_id', $treatment->id)
            : $service->treatmentRates()->where('treatment_type_id', $treatment->id)->first();

        return $row?->price;
    }

    private function syncRelations(Service $service, array $data, ?User $actor): void
    {
        if (array_key_exists('treatment_rates', $data)) {
            $this->syncTreatmentRates($service, $data['treatment_rates'] ?? [], $actor);
        }
        if (array_key_exists('finish_option_ids', $data)) {
            $service->finishOptions()->sync($data['finish_option_ids'] ?? []);
        }
        if (array_key_exists('associated_service_ids', $data)) {
            $service->associatedServices()->sync(array_values(array_diff($data['associated_service_ids'] ?? [], [$service->id])));
        }
    }

    /** @param  array<int, array{treatment_type_id: int, price: int|null, delay_hours: int|null}>  $rows */
    private function syncTreatmentRates(Service $service, array $rows, ?User $actor): void
    {
        $describe = fn ($r) => sprintf('#%d: %s FCFA / %s h', $r['treatment_type_id'], $r['price'] ?? 'auto', $r['delay_hours'] ?? 'auto');
        $old = $service->treatmentRates()->orderBy('treatment_type_id')->get()
            ->map(fn (ServiceTreatmentPrice $r) => $describe($r->only(['treatment_type_id', 'price', 'delay_hours'])))->implode(', ');

        $service->treatmentRates()->delete();
        $kept = collect($rows)->filter(fn ($r) => ($r['price'] ?? null) !== null || ($r['delay_hours'] ?? null) !== null)
            ->sortBy('treatment_type_id')->values();
        foreach ($kept as $row) {
            $service->treatmentRates()->create([
                'treatment_type_id' => $row['treatment_type_id'],
                'price' => $row['price'] ?? null,
                'delay_hours' => $row['delay_hours'] ?? null,
            ]);
        }

        $new = $kept->map($describe)->implode(', ');
        if ($old !== $new) {
            $this->logHistory($service, 'treatment_rates', $old ?: null, $new ?: null, $actor);
        }
        $service->unsetRelation('treatmentRates');
    }

    public function createService(array $data, ?User $actor): Service
    {
        return DB::transaction(function () use ($data, $actor) {
            $service = Service::create([
                'pressing_id' => $actor?->pressing_id,
                ...Arr::except($data, self::RELATION_KEYS),
            ]);

            $this->syncRelations($service, $data, $actor);

            if (! empty($data['price_tiers'])) {
                $this->syncTiers($service, $data['price_tiers'], $actor);
            }

            // Correctif racine (audit Figma 2026-10-06, voir CLAUDE.md) : sans ceci, un
            // service fraîchement créé n'avait aucune ligne `agency_services` — or
            // ServiceController::index() et OrderController::store() résolvent le
            // catalogue comptoir via $agency->services() (jointure INNER sur le pivot),
            // donc un service sans ligne pivot était introuvable/inachetable dans
            // TOUTES les agences, malgré le défaut `is_active = true` de la colonne
            // pivot qui laissait croire le contraire. Restaure le sens réel de ce
            // défaut : actif partout sauf désactivation explicite ensuite.
            $agencyIds = Agency::where('pressing_id', $actor?->pressing_id)->where('is_active', true)->pluck('id');
            $service->agencies()->syncWithoutDetaching(
                $agencyIds->mapWithKeys(fn ($id) => [$id => ['is_active' => true]])->all()
            );

            return $service->fresh(['priceTiers', 'treatmentRates', 'finishOptions:id,name', 'associatedServices:id,code,name']);
        });
    }

    public function updateService(Service $service, array $data, ?User $actor): Service
    {
        return DB::transaction(function () use ($service, $data, $actor) {
            if (array_key_exists('base_price', $data) && (int) $data['base_price'] !== $service->base_price) {
                $this->logHistory($service, 'base_price', (string) $service->base_price, (string) $data['base_price'], $actor);
            }

            // Publier efface le brouillon : la version publiée devient la référence.
            $service->update([
                ...Arr::except($data, self::RELATION_KEYS),
                'draft_data' => null, 'draft_saved_at' => null, 'draft_saved_by' => null,
            ]);
            $this->syncRelations($service, $data, $actor);

            if (array_key_exists('price_tiers', $data)) {
                $this->syncTiers($service, $data['price_tiers'], $actor);
            }

            return $service->fresh(['priceTiers', 'treatmentRates', 'finishOptions:id,name', 'associatedServices:id,code,name']);
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
        $describe = fn ($t) => sprintf('%s-%s kg: %s', $t['weight_min'], $t['weight_max'] ?? '∞', $t['price_per_kg'])
            .(empty($t['treatment_prices']) ? '' : ' '.json_encode($t['treatment_prices']));

        $old = $service->priceTiers()->get()
            ->map(fn (ServicePriceTier $t) => $describe(['weight_min' => $t->weight_min, 'weight_max' => $t->weight_max, 'price_per_kg' => $t->price_per_kg, 'treatment_prices' => $t->treatment_prices]))
            ->implode(', ');

        $service->priceTiers()->delete();
        foreach ($tiers as $tier) {
            ServicePriceTier::create([
                'service_id' => $service->id,
                'weight_min' => $tier['weight_min'],
                'weight_max' => $tier['weight_max'] ?? null,
                'price_per_kg' => $tier['price_per_kg'],
                'treatment_prices' => $this->cleanTierTreatmentPrices($tier['treatment_prices'] ?? null),
            ]);
        }

        $new = collect($tiers)->map(fn ($t) => $describe([...$t, 'treatment_prices' => $this->cleanTierTreatmentPrices($t['treatment_prices'] ?? null)]))->implode(', ');

        if ($old !== $new) {
            $this->logHistory($service, 'price_tiers', $old ?: null, $new ?: null, $actor);
        }
    }

    /** @return array<string, int>|null */
    private function cleanTierTreatmentPrices(?array $prices): ?array
    {
        $clean = collect($prices ?? [])->filter(fn ($v) => $v !== null && $v !== '')->map(fn ($v) => (int) $v)
            ->mapWithKeys(fn ($v, $k) => [(string) $k => $v])->all();

        return $clean === [] ? null : $clean;
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
