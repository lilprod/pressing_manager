<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('client_id')->constrained();
            $table->enum('method', ['espece', 'carte', 'flooz', 'tmoney']);
            $table->unsignedInteger('amount');
            $table->char('currency', 3)->default('XOF');
            $table->enum('status', ['en_attente', 'complete', 'echoue', 'rembourse'])->default('en_attente');
            // Référence de transaction de l'opérateur (Flooz/T-Money) ou du gateway carte.
            // Combinée à `method`, sert de clé d'idempotence pour ne jamais traiter deux fois le même callback.
            $table->string('external_reference')->nullable();
            $table->json('payload')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->unique(['method', 'external_reference']);
            $table->index(['agency_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
