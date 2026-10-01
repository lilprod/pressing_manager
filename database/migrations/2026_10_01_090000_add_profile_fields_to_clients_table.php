<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->string('phone_secondary', 30)->nullable()->after('phone');
            $table->string('city', 255)->nullable()->after('address');
            $table->string('contact_preference', 20)->nullable()->after('city');
            $table->string('referral_code', 50)->nullable()->after('contact_preference');
            $table->boolean('sms_consent')->default(false)->after('is_active');
            $table->boolean('email_consent')->default(false)->after('sms_consent');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn(['phone_secondary', 'city', 'contact_preference', 'referral_code', 'sms_consent', 'email_consent']);
        });
    }
};
