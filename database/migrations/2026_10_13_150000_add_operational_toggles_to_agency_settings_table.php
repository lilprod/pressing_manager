<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paramètres opérationnels (capture Figma, audit du 2026-10-13) :
 * - loyalty_accrue_on_promotions : « Cumuler sur les promotions » — si désactivé, un
 *   paiement sur un dépôt avec promotion ne crédite pas de points (LoyaltyService) ;
 * - offline_enabled : « Activer le mode hors ligne » — si désactivé, le comptoir
 *   refuse de mettre un dépôt en file locale sans réseau (NewOrder.tsx).
 * Défauts = comportement existant (cumul et hors ligne actifs).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agency_settings', function (Blueprint $table) {
            $table->boolean('loyalty_accrue_on_promotions')->default(true);
            $table->boolean('offline_enabled')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('agency_settings', function (Blueprint $table) {
            $table->dropColumn(['loyalty_accrue_on_promotions', 'offline_enabled']);
        });
    }
};
