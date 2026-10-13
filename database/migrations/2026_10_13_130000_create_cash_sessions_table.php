<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sessions de caisse par caissier (Bilan journalier, capture Figma, audit du
 * 2026-10-13) : ouverture avec fond de caisse, pause, clôture avec comptage et écart.
 * Les encaissements espèces enregistrés pendant une session ouverte y sont rattachés
 * (payments.cash_session_id). Objectif journalier par caissier : réglage d'agence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('register_label', 40);
            $table->enum('status', ['open', 'paused', 'closed'])->default('open');
            $table->unsignedInteger('opening_float')->default(0);
            $table->timestamp('opened_at');
            $table->timestamp('paused_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->integer('expected_amount')->nullable();
            $table->integer('counted_amount')->nullable();
            $table->integer('variance')->nullable();
            $table->string('notes', 500)->nullable();
            $table->timestamps();
            $table->index(['agency_id', 'opened_at']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('cash_session_id')->nullable()->constrained()->nullOnDelete();
        });

        Schema::table('agency_settings', function (Blueprint $table) {
            $table->unsignedInteger('cashier_daily_target')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agency_settings', fn (Blueprint $table) => $table->dropColumn('cashier_daily_target'));
        Schema::table('payments', fn (Blueprint $table) => $table->dropConstrainedForeignId('cash_session_id'));
        Schema::dropIfExists('cash_sessions');
    }
};
