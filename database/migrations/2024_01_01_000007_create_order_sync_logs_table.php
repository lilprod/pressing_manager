<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Trace chaque réconciliation d'une commande créée hors-ligne, avec le conflit rencontré s'il y en a eu.
        Schema::create('order_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('client_local_uuid');
            $table->enum('conflict_type', ['numerotation', 'statut', 'aucun'])->default('aucun');
            $table->text('resolution_notes')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->index('client_local_uuid');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_sync_logs');
    }
};
