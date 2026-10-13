<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fiche article conforme à la maquette « Modifier l'article » (2026-10-13) :
 * - catégorie libre (familles de vêtements comme « Cérémonie »), l'ancienne liste
 *   fermée nettoyage/lavage/… reste valide mais n'est plus la seule ;
 * - prix et délai explicites par traitement (Classique/Express/Repassage…) au lieu du
 *   seul ratio global, y compris par tranche de la grille au kilo ;
 * - rendus compatibles (sur cintre, plié, sous housse…) choisis au comptoir ;
 * - services associés (autres articles du catalogue suggérés au comptoir) ;
 * - éligibilité à la livraison à domicile ;
 * - brouillon serveur (sauvegarde automatique) avant publication.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check');
        }

        Schema::table('services', function (Blueprint $table) {
            $table->boolean('home_delivery_enabled')->default(true)->after('price_editable_at_counter');
            $table->json('draft_data')->nullable();
            $table->timestamp('draft_saved_at')->nullable();
            $table->foreignId('draft_saved_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('service_treatment_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->foreignId('treatment_type_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('price')->nullable();
            $table->unsignedInteger('delay_hours')->nullable();
            $table->timestamps();
            $table->unique(['service_id', 'treatment_type_id']);
        });

        Schema::table('service_price_tiers', function (Blueprint $table) {
            $table->json('treatment_prices')->nullable();
        });

        Schema::create('finish_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pressing_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['pressing_id', 'name']);
        });

        Schema::create('service_finish_option', function (Blueprint $table) {
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->foreignId('finish_option_id')->constrained()->cascadeOnDelete();
            $table->primary(['service_id', 'finish_option_id']);
        });

        Schema::create('service_associations', function (Blueprint $table) {
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->foreignId('associated_service_id')->constrained('services')->cascadeOnDelete();
            $table->primary(['service_id', 'associated_service_id']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('finish_option_id')->nullable()->constrained()->nullOnDelete();
        });

        // Rendus par défaut pour chaque pressing existant (référentiel modifiable ensuite).
        $now = now();
        foreach (DB::table('pressings')->pluck('id') as $pressingId) {
            foreach (['Sur cintre', 'Plié', 'Plié premium', 'Sous housse'] as $i => $name) {
                DB::table('finish_options')->insert([
                    'pressing_id' => $pressingId, 'name' => $name, 'is_active' => true,
                    'sort_order' => $i, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('order_items', fn (Blueprint $table) => $table->dropConstrainedForeignId('finish_option_id'));
        Schema::dropIfExists('service_associations');
        Schema::dropIfExists('service_finish_option');
        Schema::dropIfExists('finish_options');
        Schema::table('service_price_tiers', fn (Blueprint $table) => $table->dropColumn('treatment_prices'));
        Schema::dropIfExists('service_treatment_prices');
        Schema::table('services', function (Blueprint $table) {
            $table->dropConstrainedForeignId('draft_saved_by');
            $table->dropColumn(['home_delivery_enabled', 'draft_data', 'draft_saved_at']);
        });
    }
};
