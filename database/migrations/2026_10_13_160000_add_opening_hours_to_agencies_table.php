<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Horaires d'ouverture d'une agence (fiche Multi-agences, capture Figma : « ouverte
 * aujourd'hui de 08:00 à 19:00 »). Optionnels : sans horaires, aucun statut
 * Ouverte/Fermée n'est affiché (jamais déduit).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn(['opens_at', 'closes_at']);
        });
    }
};
