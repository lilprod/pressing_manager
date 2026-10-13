<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * « États du linge acceptés » par article (fiche article, capture Figma). Aucune
 * ligne = tous les états sont acceptés (comportement existant). Sinon, le comptoir
 * ne propose que ces états et la création de dépôt rejette les autres.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_intake_condition', function (Blueprint $table) {
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->foreignId('intake_condition_id')->constrained()->cascadeOnDelete();
            $table->primary(['service_id', 'intake_condition_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_intake_condition');
    }
};
