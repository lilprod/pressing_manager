<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Urgent/Haute par défaut à partir de is_express (voir OrderController::store),
            // mais modifiable ensuite par l'atelier (ex. client VIP, retard imminent).
            $table->enum('priority', ['urgent', 'haute', 'normale'])->default('normale')->after('is_express');
            // Responsabilités Laveur/Classeur du vue Kanban (section 04 Figma) : un dépôt,
            // pas un article, est affecté à chaque étape — voir AtelierController.
            $table->foreignId('washer_id')->nullable()->after('priority')->constrained('users')->nullOnDelete();
            $table->foreignId('sorter_id')->nullable()->after('washer_id')->constrained('users')->nullOnDelete();
        });

        Schema::table('agencies', function (Blueprint $table) {
            // Nombre de dépôts actifs (statuts recu..pret) que l'atelier peut traiter en
            // parallèle. Null = pas encore configuré, repli sur config('atelier.default_capacity').
            $table->unsignedInteger('workshop_capacity')->nullable()->after('unclaimed_item_threshold_days');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sorter_id');
            $table->dropConstrainedForeignId('washer_id');
            $table->dropColumn('priority');
        });

        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('workshop_capacity');
        });
    }
};
