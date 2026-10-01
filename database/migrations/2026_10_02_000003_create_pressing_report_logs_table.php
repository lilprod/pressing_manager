<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal append-only des rapports d'activité poussés par chaque déploiement pressing
 * (voir PressingReportController, authentifié par jeton dédié — pas Sanctum). Source réelle
 * du graphique « Activité plateforme » du tableau de bord superadmin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pressing_report_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pressing_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('agencies_count');
            $table->unsignedInteger('active_users_count');
            $table->unsignedInteger('operations_count');
            $table->timestamp('period_started_at');
            $table->timestamp('period_ended_at');
            $table->string('app_version', 40)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['pressing_id', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pressing_report_logs');
    }
};
