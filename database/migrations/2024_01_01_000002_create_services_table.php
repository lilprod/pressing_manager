<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->enum('category', ['nettoyage', 'repassage', 'retouche', 'teinture', 'autre'])->default('autre');
            $table->text('description')->nullable();
            // Montant en FCFA (devise sans sous-unité), entier.
            $table->unsignedInteger('base_price');
            $table->unsignedSmallInteger('estimated_duration_hours')->default(24);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
