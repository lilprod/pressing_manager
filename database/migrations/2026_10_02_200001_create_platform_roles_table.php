<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Catalogue de rôles pour le personnel Spark (console superadmin) — mirrors `roles`
 * côté tenant. Fixe en Phase 2 (pas d'écran de gestion de rôles, juste un <select>
 * dans le formulaire utilisateur, comme le montre la maquette).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_roles', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 30)->unique();
            $table->string('name');
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        DB::table('platform_roles')->insert([
            ['slug' => 'superadmin', 'name' => 'Superadmin', 'is_system' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'admin_transverse', 'name' => 'Administratrice transverse', 'is_system' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'auditeur_transverse', 'name' => 'Auditeur transverse', 'is_system' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_roles');
    }
};
