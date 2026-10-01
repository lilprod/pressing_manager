<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_price_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            // "base_price" ou "price_tiers" (changement de grille au kilo).
            $table->string('field', 40);
            $table->string('old_value')->nullable();
            $table->string('new_value')->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('changed_at');

            $table->index(['service_id', 'changed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_price_histories');
    }
};
