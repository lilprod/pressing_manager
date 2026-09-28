<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Table singleton (une seule ligne, id=1) : identité globale du pressing,
        // utilisée pour la marque de l'application (titre, favicon, reçus).
        Schema::create('app_settings', function (Blueprint $table) {
            $table->id();
            $table->string('pressing_name')->nullable();
            $table->string('address')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('favicon_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');
    }
};
