<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Affectations d'un utilisateur transverse à un sous-ensemble de pressings
 * (chips « Éclat Royal +2 » de la maquette). Sans effet pour un superadmin, qui
 * accède à tous les pressings indépendamment de ce pivot — voir PlatformUser::canAccessPressing().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pressing_platform_user', function (Blueprint $table) {
            $table->foreignId('pressing_id')->constrained()->cascadeOnDelete();
            $table->foreignId('platform_user_id')->constrained()->cascadeOnDelete();
            $table->primary(['pressing_id', 'platform_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pressing_platform_user');
    }
};
