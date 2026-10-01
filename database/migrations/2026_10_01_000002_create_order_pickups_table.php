<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_pickups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // Dénormalisé depuis orders.agency_id pour un filtrage RBAC direct sans jointure.
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->enum('recipient_type', ['client', 'tiers']);
            $table->string('recipient_name');
            $table->enum('condition_status', ['conforme', 'reserve', 'anomalie'])->default('conforme');
            $table->text('condition_notes')->nullable();
            $table->unsignedInteger('payment_collected_amount')->default(0);
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            // Retrait autorisé malgré un solde restant dû (dérogation) : voir CLAUDE.md,
            // le blocage configurable par agence (EF-RET-05) n'existe pas encore — ici le
            // blocage est systématique et seule une dérogation ponctuelle, tracée, le lève.
            $table->boolean('balance_overridden')->default(false);
            $table->text('override_reason')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at');
            $table->timestamps();

            $table->index(['agency_id', 'processed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_pickups');
    }
};
