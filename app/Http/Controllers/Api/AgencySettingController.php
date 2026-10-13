<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\AgencySetting\UpdateAgencySettingRequest;
use App\Models\Agency;
use App\Models\AgencySetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Écran « Paramètres opérationnels » (CLAUDE.md « Opérationnel »), par agence.
 * Mirrors SettingsController (singleton auto-créé) mais gardé par authorizeAgency
 * (pas pressing-wide comme AppSetting) — même convention que AgencyController.
 */
class AgencySettingController extends ApiController
{
    /**
     * Lecture ouverte à tout le personnel de l'agence (pas seulement agencies.manage,
     * contrairement à update()) : le comptoir a besoin de connaître le montant minimum,
     * les délais et le seuil de fidélité pour créer un dépôt correctement — voir
     * NewOrder.tsx. Rien d'exposé ici n'est sensible (aucun montant encaissé, aucune
     * donnée d'un autre membre du personnel).
     */
    public function show(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAgency($request->user(), $agency->id);

        return response()->json($this->present(AgencySetting::forAgency($agency->id)));
    }

    public function update(UpdateAgencySettingRequest $request, Agency $agency): JsonResponse
    {
        $this->authorizeAgency($request->user(), $agency->id);

        $settings = AgencySetting::forAgency($agency->id);
        $settings->update($request->validated());

        return response()->json($this->present($settings->refresh()));
    }

    /**
     * « Codes dépôt par agence » (capture Figma) : préfixe/suffixe de toutes les agences
     * du pressing sur une seule carte, avec l'aperçu réel du prochain numéro formaté.
     * Agences accessibles uniquement (un manager local ne voit que les siennes).
     */
    public function numbering(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');

        $agencies = Agency::query()
            ->whereIn('id', $this->resolveAgencyFilter($request->merge(['agency_id' => null]), $request->user()))
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return response()->json($agencies->map(function (Agency $agency) {
            $settings = AgencySetting::forAgency($agency->id);
            $next = (int) \App\Models\Order::query()->where('agency_id', $agency->id)->max('order_number') + 1;

            return [
                'agency_id' => $agency->id,
                'agency_name' => $agency->name,
                'order_number_prefix' => $settings->order_number_prefix,
                'order_number_suffix' => $settings->order_number_suffix,
                'order_number_padding' => $settings->order_number_padding,
                'next_number' => $next,
            ];
        })->values());
    }

    /** Mise à jour groupée des codes dépôt (une transaction, chaque agence vérifiée). */
    public function updateNumbering(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');
        $data = $request->validate([
            'agencies' => ['required', 'array', 'min:1'],
            'agencies.*.agency_id' => ['required', 'integer'],
            'agencies.*.order_number_prefix' => ['nullable', 'string', 'max:10', 'regex:/^[A-Za-z0-9\-_\/]*$/'],
            'agencies.*.order_number_suffix' => ['nullable', 'string', 'max:10', 'regex:/^[A-Za-z0-9\-_\/]*$/'],
        ]);

        \Illuminate\Support\Facades\DB::transaction(function () use ($data, $request) {
            foreach ($data['agencies'] as $row) {
                $this->authorizeAgency($request->user(), (int) $row['agency_id']);
                AgencySetting::forAgency((int) $row['agency_id'])->update([
                    'order_number_prefix' => $row['order_number_prefix'] ?? null,
                    'order_number_suffix' => $row['order_number_suffix'] ?? null,
                ]);
            }
        });

        return $this->numbering($request);
    }

    private function present(AgencySetting $settings): array
    {
        return [
            'agency_id' => $settings->agency_id,
            'order_number_prefix' => $settings->order_number_prefix,
            'order_number_suffix' => $settings->order_number_suffix,
            'order_number_padding' => $settings->order_number_padding,
            'standard_delay_hours' => $settings->standard_delay_hours,
            'express_delay_hours' => $settings->express_delay_hours,
            'finishing_delay_hours' => $settings->finishing_delay_hours,
            'allow_immediate_pickup' => $settings->allow_immediate_pickup,
            'block_pickup_if_unpaid' => $settings->block_pickup_if_unpaid,
            'washer_step_enabled' => $settings->washer_step_enabled,
            'sorter_step_enabled' => $settings->sorter_step_enabled,
            'collection_fee' => $settings->collection_fee,
            'loyalty_accrue_on_promotions' => $settings->loyalty_accrue_on_promotions,
            'offline_enabled' => $settings->offline_enabled,
            'delivery_fee' => $settings->delivery_fee,
            'minimum_order_amount' => $settings->minimum_order_amount,
            'loyalty_amount_per_point' => $settings->loyalty_amount_per_point,
            'loyalty_redemption_threshold' => $settings->loyalty_redemption_threshold,
            'loyalty_point_expiry_months' => $settings->loyalty_point_expiry_months,
            'cashier_daily_target' => $settings->cashier_daily_target,
            'loyalty_point_value_fcfa' => $settings->loyalty_point_value_fcfa,
            'offline_sync_interval_minutes' => $settings->offline_sync_interval_minutes,
            'offline_retention_days' => $settings->offline_retention_days,
            'updated_at' => $settings->updated_at?->toIso8601String(),
        ];
    }
}
