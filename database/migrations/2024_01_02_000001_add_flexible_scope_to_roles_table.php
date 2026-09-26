<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Le rôle manager peut être global ou rattaché à une agence selon l'utilisateur :
     * ni 'global' ni 'agency' seuls ne le décrivent, d'où l'ajout de 'flexible'.
     */
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE roles DROP CONSTRAINT roles_scope_check');
            DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_scope_check CHECK (scope IN ('global', 'agency', 'flexible'))");
        }
    }

    public function down(): void
    {
        DB::table('roles')->where('scope', 'flexible')->update(['scope' => 'agency']);

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE roles DROP CONSTRAINT roles_scope_check');
            DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_scope_check CHECK (scope IN ('global', 'agency'))");
        }
    }
};
