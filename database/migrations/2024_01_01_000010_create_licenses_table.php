<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Une seule licence "courante" par déploiement (modèle mono-client, voir architecture).
        Schema::create('licenses', function (Blueprint $table) {
            $table->id();
            $table->string('plan', 40);
            $table->timestamp('starts_at');
            $table->timestamp('expires_at');
            $table->unsignedSmallInteger('grace_period_days')->default(7);
            $table->enum('status', ['active', 'grace_period', 'expired'])->default('active');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};
