<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notes internes multiples par client (fiche client, capture Figma « Détail-Client ») :
 * auteur + date, append-only côté UI. Distinctes de `clients.notes` (champ libre unique
 * du formulaire), conservé tel quel. Ajoute aussi `clients.care_instructions` —
 * consignes de manutention saisies par le personnel (« Chemises sur cintre »).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['client_id', 'created_at']);
        });

        Schema::table('clients', function (Blueprint $table) {
            $table->string('care_instructions', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('clients', fn (Blueprint $table) => $table->dropColumn('care_instructions'));
        Schema::dropIfExists('client_notes');
    }
};
