<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event', 40);
            $table->enum('channel', ['mail', 'sms']);
            $table->string('recipient');
            $table->text('message');
            // "simulated" : aucune passerelle SMS n'est configurée pour ce déploiement (voir
            // NotificationService) — le message est journalisé plutôt que transmis à un opérateur.
            $table->enum('status', ['sent', 'simulated', 'failed'])->default('sent');
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->index(['agency_id', 'event']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_logs');
    }
};
