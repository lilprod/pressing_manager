<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Séparation Article × Service du CDC v3.0 (§11.1-11.3) : un article (modèle
        // Service existant, ex. "Chemise homme") garde son prix de référence
        // (base_price) ; un traitement (ici) porte un ratio appliqué automatiquement à
        // ce prix (ex. Express = Classique × 1,5) — additif, ne modifie aucune ligne de
        // commande existante.
        Schema::create('treatment_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->decimal('price_ratio', 4, 2);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('treatment_types');
    }
};
