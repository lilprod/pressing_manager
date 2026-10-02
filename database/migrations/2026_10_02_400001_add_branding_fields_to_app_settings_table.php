<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Écran « Branding du pressing » (CLAUDE.md « Pivot multi-tenant » puis « Hub /
 * Branding / Opérationnel ») : palette, monogramme, présence numérique, documents
 * commerciaux, et le mécanisme de brouillon (draft_data/draft_saved_at) consommé
 * par le nouveau workflow brouillon -> publication.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->string('primary_color', 7)->nullable()->after('favicon_path');
            $table->string('secondary_color', 7)->nullable()->after('primary_color');
            $table->string('monogram', 4)->nullable()->after('secondary_color');
            $table->string('website')->nullable()->after('tax_id');
            $table->text('legal_notice')->nullable()->after('website');
            $table->text('ticket_footer')->nullable()->after('legal_notice');
            $table->text('ticket_conditions')->nullable()->after('ticket_footer');
            // Brouillon : jamais appliqué tant que /settings/publish n'a pas été appelé.
            $table->json('draft_data')->nullable()->after('ticket_conditions');
            $table->timestamp('draft_saved_at')->nullable()->after('draft_data');
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn([
                'primary_color', 'secondary_color', 'monogram', 'website',
                'legal_notice', 'ticket_footer', 'ticket_conditions',
                'draft_data', 'draft_saved_at',
            ]);
        });
    }
};
