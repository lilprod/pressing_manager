<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Remplace config('licensing.plans') (codé en dur, sans interface d'administration)
     * par une table gérable depuis l'écran de licence.
     */
    public function up(): void
    {
        Schema::create('license_plans', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 30)->unique();
            $table->string('name');
            $table->unsignedSmallInteger('days');
            // Montant en FCFA (devise sans sous-unité), entier.
            $table->unsignedInteger('price');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Reprend les 3 plans historiquement codés en dur dans config/licensing.php.
        DB::table('license_plans')->insert([
            ['slug' => 'mensuel', 'name' => 'Mensuel', 'days' => 30, 'price' => 15000, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'trimestriel', 'name' => 'Trimestriel', 'days' => 90, 'price' => 40000, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'annuel', 'name' => 'Annuel', 'days' => 365, 'price' => 150000, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('license_plans');
    }
};
