<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_permissions', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('name');
            $table->string('group', 30);
            $table->timestamps();
        });

        DB::table('platform_permissions')->insert([
            ['slug' => 'pressings.manage', 'name' => 'Gérer les pressings affectés', 'group' => 'pressings', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'platform_users.manage', 'name' => 'Gérer les utilisateurs', 'group' => 'admin', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'reports.view', 'name' => 'Consulter les rapports consolidés', 'group' => 'reports', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'licenses.manage', 'name' => 'Modifier les licences', 'group' => 'pressings', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_permissions');
    }
};
