<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pivot multi-tenant (CLAUDE.md « Pivot multi-tenant ») : ce déploiement peut
 * désormais héberger plusieurs pressings, chacun avec ses propres agences, son
 * personnel, son catalogue — totalement étanches. `pressing_id` devient la
 * racine du scoping pour `agencies`/`users` (tout le reste du schéma métier est
 * déjà scopé par `agency_id`, qui pointe maintenant vers une agence elle-même
 * rattachée à un pressing — voir `User::canAccessAgency()`/
 * `ApiController::resolveAgencyFilter()`) et pour les catalogues jusqu'ici
 * deployment-wide (`app_settings`, `services`, `treatment_types`).
 *
 * Backfill : les données déjà en base sont rattachées à un pressing
 * "historique" créé ici si nécessaire, pour ne rien perdre lors de la montée
 * de version d'un déploiement existant.
 */
return new class extends Migration
{
    private const SCOPED_TABLES = ['agencies', 'users', 'app_settings', 'services', 'treatment_types'];

    private const CODE_UNIQUE_TABLES = ['agencies', 'services', 'treatment_types'];

    public function up(): void
    {
        foreach (self::SCOPED_TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreignId('pressing_id')->nullable()->after('id')->constrained('pressings')->restrictOnDelete();
            });
        }

        $legacyPressingId = DB::table('pressings')->value('id');

        if ($legacyPressingId === null && (DB::table('agencies')->exists() || DB::table('users')->exists())) {
            $planId = DB::table('platform_plans')->where('slug', 'starter')->value('id')
                ?? DB::table('platform_plans')->value('id');

            $pressingName = DB::table('app_settings')->value('pressing_name') ?: 'Pressing historique';

            $legacyPressingId = DB::table('pressings')->insertGetId([
                'name' => $pressingName,
                'code' => 'LEGACY',
                'platform_plan_id' => $planId,
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if ($legacyPressingId !== null) {
            foreach (self::SCOPED_TABLES as $tableName) {
                DB::table($tableName)->whereNull('pressing_id')->update(['pressing_id' => $legacyPressingId]);
            }
        }

        // Unicité composite par pressing plutôt que globale pour les codes d'agence/catalogue.
        // users.email reste volontairement unique à l'échelle du déploiement (voir CLAUDE.md).
        foreach (self::CODE_UNIQUE_TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $table->dropUnique($tableName.'_code_unique');
                $table->unique(['pressing_id', 'code']);
            });
        }

        foreach (self::SCOPED_TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('pressing_id')->nullable(false)->change();
            });
        }
    }

    public function down(): void
    {
        foreach (self::CODE_UNIQUE_TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropUnique(['pressing_id', 'code']);
                $table->unique('code');
            });
        }

        foreach (self::SCOPED_TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropConstrainedForeignId('pressing_id');
            });
        }
    }
};
