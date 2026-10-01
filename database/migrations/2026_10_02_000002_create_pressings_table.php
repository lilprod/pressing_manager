<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Registre central des pressings clients, tenu par la plateforme Spark (superadmin).
 * Chaque pressing tourne en réalité sur son propre déploiement (VPS + base PostgreSQL
 * dédiée, voir docs/ARCHITECTURE.md) — ce registre ne contient donc jamais les données
 * métier du pressing, seulement ce que la plateforme a besoin de savoir à son sujet :
 * identité, plan, licence, et les compteurs que ce déploiement lui rapporte périodiquement
 * (voir pressing_report_logs). Pas de requête live vers la base du client.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pressings', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code', 20)->unique();
            $table->char('country_code', 2)->nullable();
            $table->foreignId('platform_plan_id')->constrained('platform_plans')->restrictOnDelete();
            $table->enum('status', ['active', 'suspended'])->default('active');
            $table->string('contact_name')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_phone')->nullable();
            $table->timestamp('license_starts_at')->nullable();
            $table->timestamp('license_expires_at')->nullable();

            // Jeton d'auto-rapport : jamais le clair en base, voir Pressing::generateReportToken().
            $table->string('report_token_hash', 64)->nullable()->unique();
            $table->timestamp('report_token_generated_at')->nullable();
            $table->timestamp('report_token_last_used_at')->nullable();

            // Dénormalisé depuis le dernier rapport reçu (pressing_report_logs) : la base du
            // client n'est pas interrogeable en direct, donc pas de withCount() live possible.
            $table->unsignedInteger('agencies_count')->default(0);
            $table->unsignedInteger('users_count')->default(0);
            $table->timestamp('last_report_at')->nullable();

            $table->timestamps();

            $table->index('status');
            $table->index('license_expires_at');
            $table->index('country_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pressings');
    }
};
