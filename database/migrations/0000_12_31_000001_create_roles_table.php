<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 30)->unique();
            $table->string('name');
            // 'global' : le rôle n'est jamais rattaché à une agence (admin, manager global).
            // 'agency' : le rôle est toujours rattaché à une agence (accueil, technicien, livreur, client).
            $table->enum('scope', ['global', 'agency'])->default('agency');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
