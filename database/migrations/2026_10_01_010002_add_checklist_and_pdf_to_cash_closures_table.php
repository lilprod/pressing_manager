<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_closures', function (Blueprint $table) {
            // Liste des clés de config('cash.closure_checklist_steps') cochées à la clôture.
            // La totalité des étapes est exigée côté service avant d'accepter la clôture.
            $table->json('checklist')->default('[]')->after('notes');
            $table->string('pdf_path')->nullable()->after('checklist');
        });
    }

    public function down(): void
    {
        Schema::table('cash_closures', function (Blueprint $table) {
            $table->dropColumn(['checklist', 'pdf_path']);
        });
    }
};
