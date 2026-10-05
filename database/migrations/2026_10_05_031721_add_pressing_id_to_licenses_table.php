<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 (harmonisation licence/facturation, voir CLAUDE.md « Licence / facturation —
 * gap d'harmonisation ») : `licenses` était une seule ligne deployment-wide, sans
 * dimension pressing — dans le modèle multi-tenant partagé, elle bloquait/débloquait
 * tous les pressings à la fois. Chaque pressing reçoit désormais sa propre ligne.
 *
 * Backfill : la licence existante (s'il y en a une) est rattachée au pressing LEGACY
 * (même pressing historique créé par le pivot multi-tenant du 2026-10-02) ; tout
 * pressing sans licence (créé depuis via la console superadmin, qui ne posait encore
 * aucune ligne `licenses`) reçoit un essai de 30 jours — valeur par défaut documentée,
 * pas une fabrication arbitraire côté affichage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->foreignId('pressing_id')->nullable()->after('id')->constrained('pressings')->restrictOnDelete();
        });

        $legacyPressingId = DB::table('pressings')->where('code', 'LEGACY')->value('id')
            ?? DB::table('pressings')->oldest('id')->value('id');

        $existingLicense = DB::table('licenses')->whereNull('pressing_id')->first();

        if ($existingLicense !== null && $legacyPressingId !== null) {
            DB::table('licenses')->where('id', $existingLicense->id)->update(['pressing_id' => $legacyPressingId]);
        }

        $pressingsWithoutLicense = DB::table('pressings')
            ->whereNotIn('id', DB::table('licenses')->whereNotNull('pressing_id')->pluck('pressing_id'))
            ->get();

        foreach ($pressingsWithoutLicense as $pressing) {
            DB::table('licenses')->insert([
                'pressing_id' => $pressing->id,
                'plan' => 'essai',
                'starts_at' => now(),
                'expires_at' => now()->addDays(30),
                'grace_period_days' => 7,
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Toute ligne "orpheline" restante (aucun pressing en base, cas d'une base
        // neuve sans aucun pressing au moment de migrer) ne peut pas être rattachée —
        // supprimée plutôt que de laisser une licence inexploitable en base.
        DB::table('licenses')->whereNull('pressing_id')->delete();

        Schema::table('licenses', function (Blueprint $table) {
            $table->foreignId('pressing_id')->nullable(false)->unique()->change();
        });
    }

    public function down(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->dropUnique(['pressing_id']);
            $table->dropConstrainedForeignId('pressing_id');
        });
    }
};
