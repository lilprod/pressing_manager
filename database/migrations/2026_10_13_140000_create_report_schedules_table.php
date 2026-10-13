<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Envois programmés du rapport (bouton « Programmer » de l'écran Rapports & bilans). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pressing_id')->constrained()->cascadeOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('frequency', ['daily', 'weekly', 'monthly']);
            $table->enum('format', ['pdf', 'excel', 'csv'])->default('pdf');
            $table->json('recipients');
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_schedules');
    }
};
