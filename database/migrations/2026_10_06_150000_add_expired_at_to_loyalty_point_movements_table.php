<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chantier « Re-audit Pressing — fidélité » (voir CLAUDE.md) : marque les mouvements
 * de gain (`reason=payment`) déjà expirés par `loyalty:expire-points`. Un mouvement
 * de gain est soit actif (`expired_at` null) soit expiré en bloc — aucune consommation
 * partielle n'existe encore (`points_consumed` toujours à 0, confirmé), donc pas de
 * solde restant par ligne à suivre.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_point_movements', function (Blueprint $table) {
            $table->timestamp('expired_at')->nullable()->after('reason');
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_point_movements', function (Blueprint $table) {
            $table->dropColumn('expired_at');
        });
    }
};
