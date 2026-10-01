<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Copie du mécanisme `audit_logs`/`Auditable`, volontairement séparée : `platform_users.id`
 * et `users.id` sont des séquences indépendantes qui entrent en collision de valeur — écrire
 * un id `platform_users` dans `audit_logs.user_id` (FK réelle vers `users`) attribuerait
 * silencieusement une action à un mauvais utilisateur tenant, ou casserait la contrainte FK.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('platform_user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 80);
            $table->string('auditable_type');
            $table->unsignedBigInteger('auditable_id');
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['auditable_type', 'auditable_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_audit_logs');
    }
};
