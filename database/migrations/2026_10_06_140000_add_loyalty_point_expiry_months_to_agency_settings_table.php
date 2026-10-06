<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chantier « Re-audit Pressing — fidélité » (voir CLAUDE.md) : expiration réelle des
 * points, par agence — même portée que `loyalty_amount_per_point`/
 * `loyalty_redemption_threshold` déjà sur cette table. `null` = jamais (comportement
 * actuel inchangé pour toute agence existante).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agency_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('loyalty_point_expiry_months')->nullable()->after('loyalty_redemption_threshold');
        });
    }

    public function down(): void
    {
        Schema::table('agency_settings', function (Blueprint $table) {
            $table->dropColumn('loyalty_point_expiry_months');
        });
    }
};
