<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Une ligne par (agence, événement), créée à la volée avec les valeurs par défaut
        // (email activé, SMS désactivé) au premier événement rencontré — voir NotificationService.
        Schema::create('notification_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40);
            $table->boolean('channel_email')->default(true);
            $table->boolean('channel_sms')->default(false);
            $table->timestamps();

            $table->unique(['agency_id', 'event']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_settings');
    }
};
