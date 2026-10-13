<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Écran Notifications (capture Figma, audit du 2026-10-13) : modèles de message
 * personnalisables par agence × évènement × canal, horaires silencieux et règles de
 * consentement par agence, envois différés (statut « deferred ») et envois de test.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40);
            $table->enum('channel', ['mail', 'sms']);
            $table->string('name', 120);
            $table->string('subject', 200)->nullable();
            $table->text('body');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['agency_id', 'event', 'channel']);
        });

        Schema::table('agency_settings', function (Blueprint $table) {
            $table->boolean('notif_quiet_enabled')->default(false);
            $table->string('notif_quiet_start', 5)->default('20:00');
            $table->string('notif_quiet_end', 5)->default('08:00');
            $table->boolean('notif_require_consent')->default(true);
            $table->boolean('notif_unsubscribe_link')->default(true);
        });

        Schema::table('notification_logs', function (Blueprint $table) {
            $table->string('subject', 200)->nullable();
            $table->timestamp('scheduled_for')->nullable();
            $table->boolean('is_test')->default(false);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_status_check');
            DB::statement("ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_status_check CHECK (status::text IN ('sent', 'simulated', 'failed', 'deferred', 'skipped'))");
        }
    }

    public function down(): void
    {
        Schema::table('notification_logs', fn (Blueprint $table) => $table->dropColumn(['subject', 'scheduled_for', 'is_test']));
        Schema::table('agency_settings', fn (Blueprint $table) => $table->dropColumn([
            'notif_quiet_enabled', 'notif_quiet_start', 'notif_quiet_end', 'notif_require_consent', 'notif_unsubscribe_link',
        ]));
        Schema::dropIfExists('notification_templates');
    }
};
