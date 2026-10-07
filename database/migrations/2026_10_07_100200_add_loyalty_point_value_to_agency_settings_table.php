<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md), carte « Règles du programme » de la
 * maquette : valeur de redemption d'un point en FCFA (« Conversion : 200 points =
 * 1 000 FCFA, valeur d'un point : 5 FCFA »). Réglage réel par agence, même portée que
 * `loyalty_amount_per_point`/`loyalty_redemption_threshold` déjà sur cette table.
 * `null` = non configuré (aucune valeur affichée tant que l'administrateur ne l'a pas
 * réglée), pas un défaut fabriqué.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agency_settings', function (Blueprint $table) {
            $table->unsignedInteger('loyalty_point_value_fcfa')->nullable()->after('loyalty_point_expiry_months');
        });
    }

    public function down(): void
    {
        Schema::table('agency_settings', function (Blueprint $table) {
            $table->dropColumn('loyalty_point_value_fcfa');
        });
    }
};
