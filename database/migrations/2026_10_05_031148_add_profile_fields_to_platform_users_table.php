<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phase 0 (continuité de compte superadmin) : avant cette migration, un
     * platform_user n'avait aucun moyen de changer/réinitialiser son mot de passe
     * après sa création — voir CLAUDE.md « Licence / facturation — gap
     * d'harmonisation » et l'audit qui l'a précédé.
     */
    public function up(): void
    {
        Schema::table('platform_users', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('is_active');
            $table->string('phone', 30)->nullable()->after('photo_path');
            $table->boolean('must_change_password')->default(false)->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('platform_users', function (Blueprint $table) {
            $table->dropColumn(['photo_path', 'phone', 'must_change_password']);
        });
    }
};
