<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lot « Équipe & rôles / Profil et sécurité » (captures Figma, audit du 2026-10-13) :
 * - auth_events : journal des connexions et évènements de sécurité (dernière connexion,
 *   activité récente de l'équipe, connexions du jour) ;
 * - agency_user : affectations complémentaires multi-agences d'un compte local ;
 * - authorized_devices : appareils de confiance qui dispensent du second facteur ;
 * - users : prénom/nom, fonction, matricule, fuseau, préférences, MFA staff (TOTP,
 *   même service que la plateforme), invitation (échéance) ;
 * - personal_access_tokens : IP + user-agent pour la liste des sessions actives.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pressing_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type', 40);
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['pressing_id', 'created_at']);
            $table->index(['user_id', 'type', 'created_at']);
        });

        Schema::create('agency_user', function (Blueprint $table) {
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['agency_id', 'user_id']);
        });

        Schema::create('authorized_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label', 120);
            $table->string('token_hash', 64)->unique();
            $table->string('user_agent', 500)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('authorized_until');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name', 120)->nullable();
            $table->string('last_name', 120)->nullable();
            $table->string('job_title', 120)->nullable();
            $table->string('employee_number', 40)->nullable();
            $table->string('timezone', 64)->nullable();
            $table->json('preferences')->nullable();
            $table->text('mfa_secret')->nullable();
            $table->timestamp('mfa_enabled_at')->nullable();
            $table->text('mfa_recovery_codes')->nullable();
            $table->boolean('mfa_required')->default(false);
            $table->timestamp('invitation_expires_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
        });

        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', fn (Blueprint $table) => $table->dropColumn(['ip_address', 'user_agent']));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn([
            'first_name', 'last_name', 'job_title', 'employee_number', 'timezone', 'preferences',
            'mfa_secret', 'mfa_enabled_at', 'mfa_recovery_codes', 'mfa_required', 'invitation_expires_at', 'last_login_at',
        ]));
        Schema::dropIfExists('authorized_devices');
        Schema::dropIfExists('agency_user');
        Schema::dropIfExists('auth_events');
    }
};
