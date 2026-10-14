<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Vocabulaire métier : l'application parle de « dépôts », jamais de « commandes ». */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->where('slug', 'orders.manage')->update(['name' => 'Gérer les dépôts']);
    }

    public function down(): void
    {
        DB::table('permissions')->where('slug', 'orders.manage')->update(['name' => 'Gérer les commandes']);
    }
};
