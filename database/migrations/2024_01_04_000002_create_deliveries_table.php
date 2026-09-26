<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('delivery_zone_id')->nullable()->constrained()->nullOnDelete();
            // Livreur assigné (rôle 'livreur') ; nullable tant que non affecté.
            $table->foreignId('livreur_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('address');
            $table->string('phone')->nullable();
            $table->unsignedInteger('fee')->default(0);
            $table->enum('status', ['a_planifier', 'en_cours', 'livree', 'echouee'])->default('a_planifier');
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            // Position GPS relevée par le livreur au moment de la livraison (pas l'adresse saisie).
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('proof_photo_path')->nullable();
            $table->string('signature_path')->nullable();
            $table->text('failure_reason')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['agency_id', 'status']);
            $table->index('livreur_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliveries');
    }
};
