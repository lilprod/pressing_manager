<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_users', function (Blueprint $table) {
            $table->foreignId('platform_role_id')->nullable()->after('id')->constrained()->nullOnDelete();
        });

        // Tout compte déjà créé avant ce chantier (ex. via platform:users:create) devient
        // Superadmin par défaut : c'était le seul rôle implicite tant que ce modèle n'existait pas.
        $superadminId = DB::table('platform_roles')->where('slug', 'superadmin')->value('id');
        DB::table('platform_users')->whereNull('platform_role_id')->update(['platform_role_id' => $superadminId]);
    }

    public function down(): void
    {
        Schema::table('platform_users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('platform_role_id');
        });
    }
};
