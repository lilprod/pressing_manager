<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chantier « Re-audit Pressing — quotas de licence » (voir CLAUDE.md). Tous
 * nullable = illimité/non précisé, préserve le comportement actuel des plans déjà
 * seedés (aucun n'a de limite tant que le superadmin n'en configure pas une).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_plans', function (Blueprint $table) {
            $table->unsignedInteger('agencies_limit')->nullable()->after('duration_days');
            $table->unsignedInteger('users_limit')->nullable()->after('agencies_limit');
            $table->unsignedInteger('storage_limit_gb')->nullable()->after('users_limit');
        });
    }

    public function down(): void
    {
        Schema::table('platform_plans', function (Blueprint $table) {
            $table->dropColumn(['agencies_limit', 'users_limit', 'storage_limit_gb']);
        });
    }
};
