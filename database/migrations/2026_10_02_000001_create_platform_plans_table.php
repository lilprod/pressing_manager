<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Catalogue des plans vendus aux pressings clients par la plateforme Spark (distinct de
 * `license_plans`, qui reste le catalogue de licences logicielles d'un déploiement mono-tenant).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_plans', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 30)->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        DB::table('platform_plans')->insert([
            ['slug' => 'starter', 'name' => 'Starter', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'essentiel', 'name' => 'Essentiel', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'pro', 'name' => 'Pro', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'business', 'name' => 'Business', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'growth', 'name' => 'Growth', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'enterprise', 'name' => 'Enterprise', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_plans');
    }
};
