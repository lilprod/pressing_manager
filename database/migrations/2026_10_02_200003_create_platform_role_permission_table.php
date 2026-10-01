<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_role_permission', function (Blueprint $table) {
            $table->foreignId('platform_role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('platform_permission_id')->constrained()->cascadeOnDelete();
            $table->primary(['platform_role_id', 'platform_permission_id']);
        });

        $roleIds = DB::table('platform_roles')->pluck('id', 'slug');
        $permissionIds = DB::table('platform_permissions')->pluck('id', 'slug');

        // Superadmin : toutes les permissions. Administratrice transverse : gère les
        // pressings/utilisateurs affectés et consulte les rapports, mais pas les
        // licences (sensible/financier, réservé au superadmin par défaut). Auditeur
        // transverse : lecture seule.
        $grants = [
            'superadmin' => ['pressings.manage', 'platform_users.manage', 'reports.view', 'licenses.manage'],
            'admin_transverse' => ['pressings.manage', 'platform_users.manage', 'reports.view'],
            'auditeur_transverse' => ['reports.view'],
        ];

        $rows = [];
        foreach ($grants as $roleSlug => $permissionSlugs) {
            foreach ($permissionSlugs as $permissionSlug) {
                $rows[] = [
                    'platform_role_id' => $roleIds[$roleSlug],
                    'platform_permission_id' => $permissionIds[$permissionSlug],
                ];
            }
        }

        DB::table('platform_role_permission')->insert($rows);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_role_permission');
    }
};
