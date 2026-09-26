<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // Dénormalisé depuis orders.agency_id pour un filtrage RBAC direct sans jointure.
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('service_id')->constrained();
            $table->string('qr_code')->unique();
            $table->string('description')->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->unsignedInteger('unit_price');
            $table->enum('status', [
                'recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'non_recupere', 'perdu',
            ])->default('recu');
            $table->enum('quality_check_result', ['ok', 'echec'])->nullable();
            $table->text('quality_check_notes')->nullable();
            $table->boolean('is_damaged')->default(false);
            $table->unsignedInteger('damage_compensation_amount')->nullable();
            $table->boolean('alteration_requested')->default(false);
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            $table->index(['agency_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
