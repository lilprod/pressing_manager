<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md) : `orders.discount_amount` est un champ
 * générique (saisi par le caissier, parfois pré-rempli par la remise de palier puis
 * librement modifié) — rien ne distingue aujourd'hui une remise fidélité d'une remise
 * manuelle ou (bientôt) d'une remise de promotion. Sans cette distinction, un KPI
 * « Remises accordées (fidélité) » agrégerait en fait *toutes* les remises, ce qui
 * serait trompeur. Deux colonnes dédiées rendent l'origine honnête et interrogeable :
 * - `loyalty_discount_amount` : part de la remise venant du taux de palier auto-calculé
 *   (non modifié par le caissier — voir `NewOrder.tsx`, `discount_is_loyalty_auto`).
 * - `promotion_id` / `promotion_discount_amount` : part venant d'un code promo appliqué.
 * `discount_amount` reste la remise totale affichée/facturée (somme des deux parts +
 * un éventuel ajustement manuel) — aucun écran existant qui le lit n'est affecté.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedInteger('loyalty_discount_amount')->default(0)->after('discount_amount');
            $table->foreignId('promotion_id')->nullable()->after('loyalty_discount_amount')->constrained('promotions')->nullOnDelete();
            $table->unsignedInteger('promotion_discount_amount')->default(0)->after('promotion_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('promotion_id');
            $table->dropColumn(['loyalty_discount_amount', 'promotion_discount_amount']);
        });
    }
};
