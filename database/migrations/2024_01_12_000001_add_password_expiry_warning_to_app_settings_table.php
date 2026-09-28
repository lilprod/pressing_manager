<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            // Nombre de jours avant l'expiration effective du mot de passe où un avertissement
            // s'affiche à l'utilisateur (indépendant de password_expiry_days, qui bloque l'accès).
            $table->unsignedSmallInteger('password_expiry_warning_days')->default(14)->after('password_expiry_days');
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn('password_expiry_warning_days');
        });
    }
};
