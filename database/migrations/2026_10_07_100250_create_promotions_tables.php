<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md, node Figma 72:20021) : le volet
 * promotions était entièrement absent côté backend — aucun modèle, aucune table.
 * Référentiel pressing-scopé (même portée que `loyalty_tiers`, `services`…), pas
 * agence-scopé : une campagne se définit une fois pour le pressing et choisit ensuite
 * ses agences éligibles via le pivot `promotion_agency` (aucune ligne dans ce pivot =
 * éligible à toutes les agences du pressing, même convention que « Toutes » dans la
 * maquette).
 *
 * `promotion_usages` est un ledger append-only (même principe que `loyalty_point_
 * movements`/`audit_logs`) : une ligne par commande où le code a été appliqué avec
 * succès, jamais modifiée après coup — permet de calculer utilisation/quota réels sans
 * dénormaliser un compteur qui pourrait diverger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pressing_id')->constrained('pressings')->restrictOnDelete();
            $table->string('name');
            $table->string('code');
            $table->enum('discount_type', ['percentage', 'fixed']);
            $table->unsignedInteger('discount_value'); // % (0-100) si percentage, FCFA si fixed
            $table->unsignedInteger('max_discount_amount')->nullable(); // plafond, percentage uniquement
            $table->date('starts_at');
            $table->date('ends_at');
            $table->unsignedInteger('quota_total')->nullable(); // null = illimité
            $table->unsignedInteger('quota_per_client')->nullable(); // null = illimité
            $table->unsignedInteger('minimum_order_amount')->nullable();
            $table->boolean('combinable_with_loyalty')->default(false);
            $table->boolean('is_active')->default(false); // brouillon tant que false
            $table->timestamps();

            $table->unique(['pressing_id', 'code']);
        });

        Schema::create('promotion_agency', function (Blueprint $table) {
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->primary(['promotion_id', 'agency_id']);
        });

        Schema::create('promotion_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->restrictOnDelete();
            $table->foreignId('client_id')->constrained('clients')->restrictOnDelete();
            $table->foreignId('order_id')->constrained('orders')->restrictOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->restrictOnDelete();
            $table->unsignedInteger('discount_amount');
            $table->timestamp('used_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_usages');
        Schema::dropIfExists('promotion_agency');
        Schema::dropIfExists('promotions');
    }
};
