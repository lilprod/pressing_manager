<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Historique des publications de branding (CLAUDE.md « Branding — brouillon /
 * publication + versions »). Append-only, mirrors audit_logs : chaque publication
 * ou restauration ajoute une ligne, jamais de réécriture.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_setting_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_setting_id')->constrained()->cascadeOnDelete();
            $table->foreignId('pressing_id')->constrained()->cascadeOnDelete();
            $table->json('data');
            $table->foreignId('restored_from_version_id')->nullable()->constrained('app_setting_versions')->nullOnDelete();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['app_setting_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_setting_versions');
    }
};
