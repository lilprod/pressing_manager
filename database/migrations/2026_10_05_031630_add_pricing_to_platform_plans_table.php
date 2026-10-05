<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phase 2 (harmonisation licence/facturation, voir CLAUDE.md) : `platform_plans`
     * était un simple catalogue de noms sans prix ni durée — `license_plans` (tenant,
     * deployment-wide, piloté par le client lui-même) portait cette donnée à la mauvaise
     * place. Fusion : le prix/la durée deviennent des attributs du plan plateforme,
     * piloté par Spark. `license_plans` n'est plus alimenté après cette migration
     * (table laissée en l'état, non supprimée — aucune FK ne la référence encore,
     * suppression différée pour rester non destructif).
     */
    public function up(): void
    {
        Schema::table('platform_plans', function (Blueprint $table) {
            $table->unsignedInteger('price')->nullable()->after('name');
            $table->string('currency', 3)->default('XOF')->after('price');
            $table->unsignedSmallInteger('duration_days')->nullable()->after('currency');
        });

        // Reprend les plans tenant existants (prix/durée) comme plans plateforme,
        // plutôt que de les perdre silencieusement.
        if (Schema::hasTable('license_plans')) {
            $existing = DB::table('platform_plans')->pluck('slug')->all();

            foreach (DB::table('license_plans')->get() as $legacyPlan) {
                if (in_array($legacyPlan->slug, $existing, true)) {
                    DB::table('platform_plans')->where('slug', $legacyPlan->slug)->update([
                        'price' => $legacyPlan->price,
                        'duration_days' => $legacyPlan->days,
                        'updated_at' => now(),
                    ]);
                } else {
                    DB::table('platform_plans')->insert([
                        'slug' => $legacyPlan->slug,
                        'name' => $legacyPlan->name,
                        'is_active' => $legacyPlan->is_active,
                        'price' => $legacyPlan->price,
                        'currency' => 'XOF',
                        'duration_days' => $legacyPlan->days,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }

        // Les 6 plans cosmétiques seedés en Phase 1 (starter/essentiel/pro/business/
        // growth/enterprise) n'ont pas d'équivalent dans l'ancien `license_plans` —
        // ils restent sans prix après la reprise ci-dessus. Un plan sans prix n'a
        // plus de sens dans un monde où le prix est l'attribut central du plan :
        // désactivé plutôt que laissé actif avec un prix fantôme (null) qui ferait
        // planter tout affichage de prix côté superadmin.
        DB::table('platform_plans')->whereNull('price')->update(['is_active' => false]);
    }

    public function down(): void
    {
        Schema::table('platform_plans', function (Blueprint $table) {
            $table->dropColumn(['price', 'currency', 'duration_days']);
        });
    }
};
