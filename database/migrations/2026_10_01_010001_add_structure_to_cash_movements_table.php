<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->enum('category', [
                'fourniture', 'salaire', 'depot_banque', 'retrait_banque', 'remboursement', 'autre',
            ])->default('autre')->after('type');
            $table->string('counterparty')->nullable()->after('reason');
            $table->string('reference')->nullable()->after('counterparty');
            $table->string('proof_path')->nullable()->after('note');
            // Double contrôle sur mouvement sensible (voir config/cash.php) : un mouvement
            // au-delà du seuil reste "en_attente" (exclu du solde théorique) jusqu'à une
            // seconde validation par un autre utilisateur habilité.
            $table->enum('status', ['valide', 'en_attente'])->default('valide')->after('proof_path');
            $table->foreignId('validated_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable()->after('validated_by');

            $table->index(['agency_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('validated_by');
            $table->dropColumn(['category', 'counterparty', 'reference', 'proof_path', 'status', 'validated_at']);
        });
    }
};
