<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_item_intake_condition', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('intake_condition_id')->constrained()->cascadeOnDelete();

            $table->unique(['order_item_id', 'intake_condition_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_item_intake_condition');
    }
};
