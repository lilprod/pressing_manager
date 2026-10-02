<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Écran « Paramètres opérationnels » (CLAUDE.md « Hub / Branding / Opérationnel »,
 * node 25:12525) : premier réglage réellement câblé par agence au-delà de
 * `workshop_capacity`/`unclaimed_item_threshold_days`. Singleton 1:1 par agence
 * (même pattern que `app_settings` 1:1 par pressing, voir `AgencySetting::forAgency()`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agency_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->unique()->constrained()->cascadeOnDelete();

            // Codes dépôt — couche d'affichage uniquement, order_number/invoice_number
            // restent des entiers bruts en base (voir Agency::formatOrderNumber()).
            $table->string('order_number_prefix', 10)->nullable();
            $table->string('order_number_suffix', 10)->nullable();
            $table->unsignedTinyInteger('order_number_padding')->default(4);

            // Délais et retrait — planchers configurables, voir OrderController::store().
            $table->unsignedSmallInteger('standard_delay_hours')->nullable();
            $table->unsignedSmallInteger('express_delay_hours')->nullable();
            $table->unsignedSmallInteger('finishing_delay_hours')->nullable();
            $table->boolean('allow_immediate_pickup')->default(false);
            // Défaut true : préserve le comportement actuel (toujours bloqué), voir
            // PickupService::process() — EF-RET-05, désormais configurable.
            $table->boolean('block_pickup_if_unpaid')->default(true);

            // Cycle atelier — masque les champs responsable si désactivé (AtelierBoard.tsx).
            $table->boolean('washer_step_enabled')->default(true);
            $table->boolean('sorter_step_enabled')->default(true);

            // Tarification et services.
            $table->unsignedInteger('collection_fee')->nullable();
            $table->unsignedInteger('delivery_fee')->nullable();
            $table->unsignedInteger('minimum_order_amount')->nullable();

            // Fidélité — repli sur config('loyalty.amount_per_point') si null, même
            // précédent que workshop_capacity/config('atelier.default_capacity').
            $table->unsignedInteger('loyalty_amount_per_point')->nullable();
            $table->unsignedInteger('loyalty_redemption_threshold')->nullable();

            // Synchronisation hors ligne — stocké et affiché, pas encore consommé par
            // resources/js/lib/sync.ts (refonte hors scope de cette passe, voir CLAUDE.md).
            $table->unsignedSmallInteger('offline_sync_interval_minutes')->nullable();
            $table->unsignedSmallInteger('offline_retention_days')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agency_settings');
    }
};
