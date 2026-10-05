<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 4 : impersonation support (« se connecter en tant que » un manager tenant).
 * Permission dédiée plutôt qu'une réutilisation de `pressings.manage` — action la
 * plus sensible de la console (accès direct aux données d'un client), réservée au
 * superadmin par défaut, jamais accordée à `admin_transverse` sans décision explicite.
 */
return new class extends Migration
{
    public function up(): void
    {
        $permissionId = DB::table('platform_permissions')->insertGetId([
            'slug' => 'pressings.impersonate',
            'name' => 'Se connecter en tant que (impersonation)',
            'group' => 'pressings',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $superadminRoleId = DB::table('platform_roles')->where('slug', 'superadmin')->value('id');

        if ($superadminRoleId !== null) {
            DB::table('platform_role_permission')->insert([
                'platform_role_id' => $superadminRoleId,
                'platform_permission_id' => $permissionId,
            ]);
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('platform_permissions')->where('slug', 'pressings.impersonate')->value('id');
        DB::table('platform_role_permission')->where('platform_permission_id', $permissionId)->delete();
        DB::table('platform_permissions')->where('slug', 'pressings.impersonate')->delete();
    }
};
