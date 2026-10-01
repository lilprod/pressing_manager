<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            // Permet un retrait partiel (ex. 3 chemises remises sur 5) sans changer le
            // statut de l'article tant que la quantité totale n'est pas remise.
            $table->unsignedInteger('quantity_delivered')->default(0)->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn('quantity_delivered');
        });
    }
};
