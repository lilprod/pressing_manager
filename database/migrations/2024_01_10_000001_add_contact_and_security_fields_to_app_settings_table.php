<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->string('phone')->nullable()->after('address');
            $table->string('email')->nullable()->after('phone');
            // NIF/RCCM : figure généralement sur les factures officielles.
            $table->string('tax_id')->nullable()->after('email');

            // Politique de mot de passe et de session, paramétrable par l'administrateur.
            $table->unsignedSmallInteger('password_expiry_days')->nullable()->after('favicon_path');
            $table->unsignedSmallInteger('session_timeout_minutes')->nullable()->default(30)->after('password_expiry_days');
            $table->unsignedTinyInteger('password_min_length')->default(8)->after('session_timeout_minutes');
            $table->boolean('password_require_uppercase')->default(true)->after('password_min_length');
            $table->boolean('password_require_number')->default(true)->after('password_require_uppercase');
            $table->boolean('password_require_symbol')->default(false)->after('password_require_number');
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn([
                'phone', 'email', 'tax_id',
                'password_expiry_days', 'session_timeout_minutes',
                'password_min_length', 'password_require_uppercase', 'password_require_number', 'password_require_symbol',
            ]);
        });
    }
};
