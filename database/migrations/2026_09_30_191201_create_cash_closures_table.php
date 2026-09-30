<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_closures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            // Date représentée par la clôture (généralement le jour où elle est effectuée).
            $table->date('business_date');
            // Solde de départ = solde compté de la clôture précédente (0 pour la toute première).
            $table->unsignedInteger('opening_balance');
            // Théorique = ouverture + encaissements espèces + entrées manuelles - sorties manuelles,
            // sur la période depuis la clôture précédente.
            $table->unsignedInteger('cash_payments_total');
            $table->unsignedInteger('manual_in_total');
            $table->unsignedInteger('manual_out_total');
            $table->unsignedInteger('expected_balance');
            // Compté physiquement par l'agent à la clôture.
            $table->unsignedInteger('counted_balance');
            // counted - expected (peut être négatif : manque de caisse).
            $table->integer('variance');
            $table->text('notes')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at');
            $table->timestamps();

            $table->unique(['agency_id', 'business_date']);
            $table->index(['agency_id', 'closed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_closures');
    }
};
