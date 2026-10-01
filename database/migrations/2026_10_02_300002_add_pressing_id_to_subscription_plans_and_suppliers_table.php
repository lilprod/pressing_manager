<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pivot multi-tenant (CLAUDE.md) : `subscription_plans` et `suppliers` admettent un
 * `agency_id` NULL pour « partagé par toutes les agences » — repéré après coup
 * (manqué dans la première passe de scoping, `2026_10_02_300001_...`) : un
 * `agency_id` NULL ne dit rien du pressing d'origine, donc un plan/fournisseur
 * "global" créé par un pressing devenait visible de tous les autres pressings de
 * ce même déploiement. Même traitement que les autres tables à portée "globale"
 * (`app_settings`/`services`/`treatment_types`).
 */
return new class extends Migration
{
    private const TABLES = ['subscription_plans', 'suppliers'];

    public function up(): void
    {
        foreach (self::TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreignId('pressing_id')->nullable()->after('id')->constrained('pressings')->restrictOnDelete();
            });
        }

        $legacyPressingId = DB::table('pressings')->where('code', 'LEGACY')->value('id')
            ?? DB::table('pressings')->value('id');

        if ($legacyPressingId !== null) {
            foreach (self::TABLES as $tableName) {
                DB::table($tableName)->whereNull('pressing_id')->update(['pressing_id' => $legacyPressingId]);
            }
        }

        foreach (self::TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('pressing_id')->nullable(false)->change();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropConstrainedForeignId('pressing_id');
            });
        }
    }
};
