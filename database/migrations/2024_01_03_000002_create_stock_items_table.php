<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Catalogue global des fournitures (détergents, cintres, sachets, boutons...),
        // sur le même principe que `services` : un catalogue partagé, décliné par agence.
        Schema::create('stock_items', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->enum('unit', ['unite', 'kg', 'litre', 'paquet'])->default('unite');
            $table->string('category', 40)->nullable();
            $table->unsignedInteger('default_reorder_threshold')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_items');
    }
};
