<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Personnel Spark (superadmin de la plateforme) — royaume d'authentification totalement
 * séparé des `users` tenant (voir config/auth.php, guard `platform`). Pas de colonne
 * rôle/permission en Phase 1 : un seul rôle implicite tant que l'écran « Utilisateurs
 * transverses » (gestion fine des permissions) n'existe pas — voir CLAUDE.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->text('totp_secret')->nullable();
            $table->timestamp('totp_enabled_at')->nullable();
            $table->unsignedTinyInteger('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_users');
    }
};
