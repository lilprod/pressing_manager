<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_price_tiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->decimal('weight_min', 6, 2);
            // null = pas de borne haute (dernière tranche, "8,01 kg et +").
            $table->decimal('weight_max', 6, 2)->nullable();
            $table->unsignedInteger('price_per_kg');
            $table->timestamps();

            $table->index(['service_id', 'weight_min']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_price_tiers');
    }
};
