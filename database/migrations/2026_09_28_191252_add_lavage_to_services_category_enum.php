<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sépare "lavage" de "nettoyage" : deux prestations distinctes dans le catalogue
     * historique du pressing (voir ServiceSeeder), auparavant confondues faute
     * de valeur d'enum dédiée.
     */
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE services DROP CONSTRAINT services_category_check');
            DB::statement("ALTER TABLE services ADD CONSTRAINT services_category_check CHECK (category IN ('nettoyage', 'lavage', 'repassage', 'retouche', 'teinture', 'autre'))");
        }
    }

    public function down(): void
    {
        DB::table('services')->where('category', 'lavage')->update(['category' => 'nettoyage']);

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE services DROP CONSTRAINT services_category_check');
            DB::statement("ALTER TABLE services ADD CONSTRAINT services_category_check CHECK (category IN ('nettoyage', 'repassage', 'retouche', 'teinture', 'autre'))");
        }
    }
};
