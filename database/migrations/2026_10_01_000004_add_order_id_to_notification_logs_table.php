<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_logs', function (Blueprint $table) {
            // Permet d'attribuer une notification "order_ready" à un dépôt précis (un
            // client peut avoir plusieurs dépôts prêts en même temps) — nécessaire pour
            // l'indicateur "en attente de notification" du Centre de retrait.
            $table->foreignId('order_id')->nullable()->after('client_id')->constrained()->nullOnDelete();
            $table->index(['order_id', 'event']);
        });
    }

    public function down(): void
    {
        Schema::table('notification_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('order_id');
        });
    }
};
