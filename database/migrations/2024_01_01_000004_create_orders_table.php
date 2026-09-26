<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            // Numéro affiché au client, unique par agence, attribué par le serveur (jamais par le client hors-ligne).
            $table->unsignedInteger('order_number');
            // Clé d'idempotence générée côté client lors d'une création hors-ligne :
            // permet de réconcilier une commande déjà synchronisée sans la dupliquer.
            $table->uuid('client_local_uuid')->nullable()->unique();
            $table->enum('status', [
                'recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'annule',
            ])->default('recu');
            $table->boolean('is_express')->default(false);
            $table->enum('source', ['comptoir', 'mobile', 'offline_sync'])->default('comptoir');
            $table->enum('sync_status', ['synced', 'pending', 'conflict'])->default('synced');
            $table->timestamp('promised_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->unsignedInteger('total_amount')->default(0);
            $table->unsignedInteger('discount_amount')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['agency_id', 'order_number']);
            $table->index(['agency_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
