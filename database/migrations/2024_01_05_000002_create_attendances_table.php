<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // clock_in/clock_out sont nullables : un pointage "absent" créé par la commande
        // hr:mark-absences n'a ni l'un ni l'autre.
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('clock_in')->nullable();
            $table->timestamp('clock_out')->nullable();
            $table->enum('status', ['present', 'retard', 'absent'])->default('present');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['agency_id', 'user_id']);
            $table->index(['user_id', 'clock_in']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
