<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_closure_counts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_closure_id')->constrained()->cascadeOnDelete();
            // Regroupement des 4 moyens de paiement réels (payments.method) en 3 lignes de
            // rapprochement, comme montré sur la maquette (Espèces / Mobile Money / Carte).
            // "Carte" couvre uniquement payments.method = carte : aucun moyen "virement"
            // n'existe dans l'enum actuel, simplification documentée dans CLAUDE.md.
            $table->enum('method', ['espece', 'mobile_money', 'carte']);
            $table->integer('theoretical_amount');
            $table->integer('counted_amount');
            $table->integer('variance');
            $table->timestamps();

            $table->unique(['cash_closure_id', 'method']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_closure_counts');
    }
};
