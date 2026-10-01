<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            // Renseigné uniquement pour un article facturé au kilo (services.billing_mode
            // kg/mixte) : le prix est alors dérivé de service_price_tiers plutôt que de
            // quantity x unit_price (quantity reste 1, voir OrderController::store).
            $table->decimal('weight_kg', 6, 2)->nullable()->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn('weight_kg');
        });
    }
};
