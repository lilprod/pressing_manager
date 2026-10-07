<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Chantier D.1 (audit de conformité superadmin, voir CLAUDE.md « Audit de
 * conformité Figma — interfaces superadmin ») : `loyalty_tiers` est le seul des 7
 * référentiels pressing-scopés (`agencies`/`users`/`app_settings`/`services`/
 * `treatment_types`/`subscription_plans`/`suppliers`) à avoir été oublié lors du
 * pivot multi-tenant du 2026-10-02 — tous les pressings du déploiement partagent
 * aujourd'hui les mêmes 3 paliers de fidélité.
 *
 * Backfill : contrairement aux autres migrations de pivot (qui rattachent les
 * lignes existantes à un seul pressing LEGACY), **chaque pressing existant reçoit
 * sa propre copie des paliers actuels** — un programme de fidélité est une donnée
 * métier dont chaque pressing a besoin pour fonctionner, pas un historique
 * qu'on peut laisser à un seul tenant. Le premier pressing (par id) garde les
 * lignes existantes (réattribuées) ; les pressings suivants reçoivent des copies.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->foreignId('pressing_id')->nullable()->after('id')->constrained('pressings')->restrictOnDelete();
        });

        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->dropUnique(['min_points']);
        });

        $pressingIds = DB::table('pressings')->orderBy('id')->pluck('id');
        $existingTiers = DB::table('loyalty_tiers')->whereNull('pressing_id')->get();

        if ($pressingIds->isNotEmpty() && $existingTiers->isNotEmpty()) {
            $firstPressingId = $pressingIds->first();
            DB::table('loyalty_tiers')->whereNull('pressing_id')->update(['pressing_id' => $firstPressingId]);

            foreach ($pressingIds->skip(1) as $pressingId) {
                foreach ($existingTiers as $tier) {
                    DB::table('loyalty_tiers')->insert([
                        'pressing_id' => $pressingId,
                        'name' => $tier->name,
                        'min_points' => $tier->min_points,
                        'discount_rate' => $tier->discount_rate,
                        'is_active' => $tier->is_active,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }

        // Tout pressing sans aucun palier (créé après le pivot, avant que cette
        // migration n'existe) reçoit le même jeu par défaut que LoyaltyTierSeeder
        // *à la date de cette migration* — snapshot figé en dur plutôt qu'une
        // référence à la constante (voir chantier « bascule dépenses FCFA/12 mois »,
        // CLAUDE.md : la constante a depuis changé de forme ; une migration historique
        // ne doit jamais dépendre d'un code applicatif mutable, seulement de son propre
        // instantané au moment où elle a été écrite).
        $defaultTiersAtThisDate = [
            ['name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05],
            ['name' => 'Or', 'min_points' => 150, 'discount_rate' => 0.10],
            ['name' => 'Platine', 'min_points' => 300, 'discount_rate' => 0.15],
        ];

        $pressingsWithoutTiers = DB::table('pressings')
            ->whereNotIn('id', DB::table('loyalty_tiers')->pluck('pressing_id'))
            ->get();

        foreach ($pressingsWithoutTiers as $pressing) {
            foreach ($defaultTiersAtThisDate as $tier) {
                DB::table('loyalty_tiers')->insert($tier + [
                    'pressing_id' => $pressing->id,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        // Ligne orpheline restante (base neuve sans aucun pressing au moment de
        // migrer) : ne peut pas être rattachée, supprimée plutôt que laissée en l'état.
        DB::table('loyalty_tiers')->whereNull('pressing_id')->delete();

        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->foreignId('pressing_id')->nullable(false)->change();
            $table->unique(['pressing_id', 'min_points']);
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->dropUnique(['pressing_id', 'min_points']);
            $table->dropConstrainedForeignId('pressing_id');
            $table->unsignedInteger('min_points')->unique()->change();
        });
    }
};
