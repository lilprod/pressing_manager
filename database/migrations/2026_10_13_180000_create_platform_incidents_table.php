<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Registre des incidents plateforme (console superadmin, audit Figma du 2026-10-13).
 * Saisis et clôturés par l'équipe Spark : ce sont eux qui alimentent « Incidents
 * ouverts », « Alertes récentes » et la pastille de santé d'un pressing — jamais une
 * télémétrie inventée. Plus les jours d'ouverture d'une agence (L→D).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pressing_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 160);
            $table->text('description')->nullable();
            $table->enum('priority', ['P1', 'P2', 'P3'])->default('P3');
            $table->enum('status', ['open', 'resolved'])->default('open');
            $table->foreignId('opened_by')->nullable()->constrained('platform_users')->nullOnDelete();
            $table->foreignId('resolved_by')->nullable()->constrained('platform_users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution')->nullable();
            $table->timestamps();
            $table->index(['status', 'priority']);
        });

        Schema::table('agencies', function (Blueprint $table) {
            $table->json('opening_days')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_incidents');
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('opening_days');
        });
    }
};
