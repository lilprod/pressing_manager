<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Catalogue global (pas d'agency_id) : l'état d'un vêtement à la réception (taché,
        // déchiré...) ne dépend pas de l'agence, contrairement au catalogue de services.
        Schema::create('intake_conditions', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('label');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intake_conditions');
    }
};
