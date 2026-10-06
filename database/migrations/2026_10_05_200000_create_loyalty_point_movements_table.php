<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Historique des points de fidélité — gap documenté dans CLAUDE.md « 09
 * Promotions et fidélité » (seul le cumul `clients.loyalty_points` existait,
 * aucun mouvement daté). Append-only (pas d'`updated_at`, aucune ligne n'est
 * jamais modifiée) — même principe d'immuabilité que `audit_logs`. Un seul
 * motif réel existe actuellement (`payment`, crédité par
 * `LoyaltyService::creditPointsForPayment()`) : aucune consommation de points
 * n'existe ailleurs dans l'app, donc pas de colonne `type` crédit/débit
 * fabriquée par anticipation — `points` reste toujours positif pour l'instant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_point_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('points');
            $table->string('reason')->default('payment');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['agency_id', 'created_at']);
            $table->index(['client_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_point_movements');
    }
};
