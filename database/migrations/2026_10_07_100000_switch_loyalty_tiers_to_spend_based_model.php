<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Audit de conformité Figma « Promotions et fidélité » (voir CLAUDE.md) : la maquette
 * base la progression de palier sur les **dépenses en FCFA des 12 derniers mois
 * glissants**, pas sur un solde de points cumulé sans limite de temps. Décision
 * actée avec l'utilisateur (bascule complète, pas un hybride) : `min_points` devient
 * `min_spend_amount` (même colonne renommée, FCFA au lieu de points). Le solde de
 * points (`clients.loyalty_points`) reste une monnaie séparée (acquisition/valeur de
 * redemption, voir `agency_settings.loyalty_point_value_fcfa`), indépendante du palier.
 *
 * Deux colonnes réellement nouvelles, alignées sur la maquette (« Niveaux de
 * fidélité ») : `point_multiplier` (pondère l'acquisition de points par palier) et
 * `benefit_description` (texte libre saisi par l'administrateur — une donnée réelle
 * qu'il configure, pas un avantage mécanique inventé par l'app).
 *
 * Backfill : les 3 paliers par défaut (Argent/Or/Platine, identifiés par nom) sont
 * recalés sur les nouvelles valeurs FCFA de `LoyaltyTierSeeder::TIERS` — un seuil de
 * "50 points" n'a aucun sens comme seuil de dépenses FCFA. Un palier personnalisé
 * (nom différent) garde sa valeur numérique telle quelle, avec cette limite documentée
 * honnêtement : aucune heuristique fiable ne permet de deviner l'intention derrière un
 * seuil personnalisé existant, à revoir manuellement par l'administrateur du pressing
 * concerné. Le palier "Essentiel" (0 FCFA, nouveau dans la maquette) est créé pour
 * chaque pressing qui n'en a pas déjà un.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->renameColumn('min_points', 'min_spend_amount');
        });

        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->decimal('point_multiplier', 3, 2)->default(1.00)->after('discount_rate');
            $table->string('benefit_description')->nullable()->after('point_multiplier');
        });

        foreach (\Database\Seeders\LoyaltyTierSeeder::TIERS as $tier) {
            if ($tier['name'] === 'Essentiel') {
                continue;
            }

            DB::table('loyalty_tiers')->where('name', $tier['name'])->update([
                'min_spend_amount' => $tier['min_spend_amount'],
                'point_multiplier' => $tier['point_multiplier'],
                'benefit_description' => $tier['benefit_description'],
            ]);
        }

        $essentiel = collect(\Database\Seeders\LoyaltyTierSeeder::TIERS)->firstWhere('name', 'Essentiel');
        $pressingsWithEssentiel = DB::table('loyalty_tiers')->where('name', 'Essentiel')->pluck('pressing_id')->all();
        $pressingsWithoutEssentiel = DB::table('pressings')->whereNotIn('id', $pressingsWithEssentiel)->pluck('id');

        foreach ($pressingsWithoutEssentiel as $pressingId) {
            DB::table('loyalty_tiers')->insert($essentiel + [
                'pressing_id' => $pressingId,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->dropColumn(['point_multiplier', 'benefit_description']);
        });

        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->renameColumn('min_spend_amount', 'min_points');
        });
    }
};
