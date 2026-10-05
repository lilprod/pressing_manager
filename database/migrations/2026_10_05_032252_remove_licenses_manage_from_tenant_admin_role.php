<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 2 (harmonisation licence/facturation, voir CLAUDE.md) : avant cette passe,
 * le rôle tenant `admin` pouvait créer ses propres `LicensePlan` (prix inclus) et
 * s'auto-renouveler — dans le modèle multi-tenant partagé, ceci bloquait/débloquait
 * TOUS les pressings du déploiement à la fois, au prix que le client fixait
 * lui-même. La gestion de la licence devient exclusivement une action plateforme
 * (Spark), jamais une permission tenant. L'écran `/license` reste visible en
 * lecture seule pour tout utilisateur authentifié (statut + historique, sans
 * action) — voir `LicenseController` et `routes/api.php`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $permissionId = DB::table('permissions')->where('slug', 'licenses.manage')->value('id');

        if ($permissionId !== null) {
            DB::table('role_permission')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->insertGetId([
            'slug' => 'licenses.manage',
            'name' => 'Gérer la licence logicielle',
            'group' => 'admin',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $adminRoleId = DB::table('roles')->where('slug', 'admin')->value('id');

        if ($adminRoleId !== null) {
            DB::table('role_permission')->insert([
                'role_id' => $adminRoleId,
                'permission_id' => $permissionId,
            ]);
        }
    }
};
