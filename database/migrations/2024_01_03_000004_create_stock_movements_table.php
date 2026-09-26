<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Journal append-only de chaque entrée/sortie de stock — source de vérité
        // à partir de laquelle agency_stock_items.quantity_on_hand est dérivée.
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['entree', 'sortie']);
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('unit_cost')->nullable();
            $table->enum('reason', ['livraison', 'consommation', 'perte', 'ajustement'])->default('ajustement');
            $table->text('notes')->nullable();
            $table->timestamp('occurred_at')->useCurrent();
            $table->timestamps();

            $table->index(['agency_id', 'stock_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
