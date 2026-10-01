<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            // "mixte" : l'article peut être facturé à la pièce OU au kilo selon le dépôt
            // (voir OrderController::store, qui lit items[].weight_kg quand présent).
            $table->enum('billing_mode', ['piece', 'kg', 'mixte'])->default('piece')->after('category');
            $table->boolean('allow_discount')->default(true)->after('is_active');
            $table->boolean('round_to_hundred')->default(false)->after('allow_discount');
            $table->boolean('price_editable_at_counter')->default(false)->after('round_to_hundred');
            // Un article facturé uniquement au kilo n'a pas de prix pièce fixe.
            $table->unsignedInteger('base_price')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn(['billing_mode', 'allow_discount', 'round_to_hundred', 'price_editable_at_counter']);
            $table->unsignedInteger('base_price')->nullable(false)->change();
        });
    }
};
