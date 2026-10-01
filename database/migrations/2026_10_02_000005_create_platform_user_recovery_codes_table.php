<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_user_recovery_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('platform_user_id')->constrained()->cascadeOnDelete();
            $table->string('code_hash', 64);
            $table->timestamp('used_at')->nullable();
            $table->timestamps();

            $table->index('platform_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_user_recovery_codes');
    }
};
