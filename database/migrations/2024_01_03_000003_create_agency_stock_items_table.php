<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Niveau de stock courant d'une fourniture pour une agence donnée.
        // La quantité n'est jamais modifiée directement : seuls les mouvements
        // (stock_movements) la font évoluer, pour garder un historique complet.
        Schema::create('agency_stock_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity_on_hand')->default(0);
            // NULL = utilise stock_items.default_reorder_threshold.
            $table->unsignedInteger('reorder_threshold_override')->nullable();
            $table->timestamps();

            $table->unique(['agency_id', 'stock_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agency_stock_items');
    }
};
