<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_plan_id')->constrained();
            $table->foreignId('agency_id')->constrained();
            $table->timestamp('started_at');
            $table->timestamp('expires_at');
            $table->unsignedInteger('quota_used')->default(0);
            $table->enum('status', ['active', 'expired', 'annulee'])->default('active');
            $table->boolean('auto_renew')->default(false);
            $table->timestamp('last_renewed_at')->nullable();
            $table->timestamps();

            $table->index(['client_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_subscriptions');
    }
};
