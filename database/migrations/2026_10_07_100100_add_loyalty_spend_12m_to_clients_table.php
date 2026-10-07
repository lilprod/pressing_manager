<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md) : compteur dénormalisé des dépenses
 * glissantes sur 12 mois, maintenu de façon hybride — incrémenté en direct à chaque
 * paiement (`LoyaltyService`, même point d'écriture que `loyalty_points`) pour une
 * mise à jour immédiate, puis recalculé chaque nuit par `loyalty:recalculate-spend`
 * (agrégat réel sur `payments`) pour faire sortir les paiements de plus de 12 mois de
 * la fenêtre glissante. Une vraie somme en direct à chaque lecture (`currentLoyaltyTier()`
 * est un attribut `appends`, donc évalué à chaque sérialisation client, y compris en
 * liste) aurait ajouté une agrégation lourde en N+1 sur tout écran listant des clients —
 * ce compteur dénormalisé évite cette régression de performance.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->unsignedInteger('loyalty_spend_12m')->default(0)->after('loyalty_points');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('loyalty_spend_12m');
        });
    }
};
