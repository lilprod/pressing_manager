<?php

namespace Tests\Feature\Platform;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\AppSetting;
use App\Models\LoyaltyTier;
use Database\Seeders\LoyaltyTierSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Chantier D.2 (audit de conformité superadmin, voir CLAUDE.md « Chantier D.2 ») :
 * couleurs de marque, politique de sécurité, workflow atelier et programme de
 * fidélité appliqués au tenant dans la même transaction que le provisionnement —
 * pas une « fiche de registre » comme avant ce chantier, mais un espace déjà
 * configuré. Rétro-compatibilité avec l'appel minimal déjà testé par
 * `PressingProvisioningTest` (tous ces champs sont optionnels).
 */
class PressingProvisioningDefaultsTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform, SeedsRbac;

    private function basePayload(): array
    {
        return [
            'name' => 'Pressing du Sahel',
            'code' => 'SAHEL-01',
            'agency_code' => 'SAHEL-DK',
            'agency_name' => 'Pressing du Sahel — Dakar',
            'manager_name' => 'Awa Ndiaye',
            'manager_email' => 'awa@sahel-pressing.sn',
        ];
    }

    public function test_provided_defaults_are_applied_to_the_new_tenant(): void
    {
        $this->seedRbac();
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();

        $response = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', $this->basePayload() + [
            'platform_plan_id' => $plan->id,
            'primary_color' => '#112233',
            'secondary_color' => '#445566',
            'security_policy' => [
                'session_timeout_minutes' => 15,
                'password_min_length' => 10,
                'password_require_symbol' => true,
            ],
            'workshop_steps' => [
                'washer_step_enabled' => false,
                'sorter_step_enabled' => true,
            ],
            'loyalty_tiers' => [
                ['name' => 'Bronze', 'min_points' => 20, 'discount_rate' => 0.02],
                ['name' => 'Argent', 'min_points' => 60, 'discount_rate' => 0.06],
            ],
        ]);
        $response->assertCreated();
        $pressingId = $response->json('id');
        $agencyId = Agency::where('pressing_id', $pressingId)->value('id');

        $appSetting = AppSetting::current($pressingId);
        $this->assertSame('#112233', $appSetting->primary_color);
        $this->assertSame('#445566', $appSetting->secondary_color);
        $this->assertSame(15, $appSetting->session_timeout_minutes);
        $this->assertSame(10, $appSetting->password_min_length);
        $this->assertTrue((bool) $appSetting->password_require_symbol);

        $agencySetting = AgencySetting::forAgency($agencyId);
        $this->assertFalse((bool) $agencySetting->washer_step_enabled);
        $this->assertTrue((bool) $agencySetting->sorter_step_enabled);

        $tiers = LoyaltyTier::where('pressing_id', $pressingId)->orderBy('min_points')->get();
        $this->assertCount(2, $tiers);
        $this->assertSame('Bronze', $tiers[0]->name);
        $this->assertSame('Argent', $tiers[1]->name);
    }

    public function test_omitting_every_new_field_keeps_the_existing_safe_defaults(): void
    {
        $this->seedRbac();
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();

        $response = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', $this->basePayload() + [
            'platform_plan_id' => $plan->id,
        ]);
        $response->assertCreated();
        $pressingId = $response->json('id');
        $agencyId = Agency::where('pressing_id', $pressingId)->value('id');

        // Aucun champ nouveau fourni : les défauts DB sûrs restent en place, rien
        // n'est écrasé par null.
        $appSetting = AppSetting::current($pressingId);
        $this->assertSame(30, $appSetting->session_timeout_minutes);
        $this->assertSame(8, $appSetting->password_min_length);
        $this->assertTrue((bool) $appSetting->password_require_uppercase);

        $agencySetting = AgencySetting::forAgency($agencyId);
        $this->assertTrue((bool) $agencySetting->washer_step_enabled);
        $this->assertTrue((bool) $agencySetting->sorter_step_enabled);

        // Programme de fidélité par défaut : repli sur LoyaltyTierSeeder::TIERS.
        $tiers = LoyaltyTier::where('pressing_id', $pressingId)->orderBy('min_points')->get();
        $this->assertCount(count(LoyaltyTierSeeder::TIERS), $tiers);
        $this->assertSame('Argent', $tiers[0]->name);
    }

    public function test_default_loyalty_tiers_are_isolated_to_their_own_pressing(): void
    {
        $this->seedRbac();
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();

        $first = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', $this->basePayload() + [
            'platform_plan_id' => $plan->id,
        ]);
        $first->assertCreated();

        $second = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', [
            'name' => 'Pressing Teranga',
            'code' => 'TERANGA-01',
            'platform_plan_id' => $plan->id,
            'agency_code' => 'TERANGA-DK',
            'agency_name' => 'Pressing Teranga — Siège',
            'manager_name' => 'Moussa Sow',
            'manager_email' => 'moussa@teranga-pressing.sn',
        ]);
        $second->assertCreated();

        // Chaque pressing a reçu sa propre copie des paliers par défaut — pas une
        // réutilisation du même jeu de lignes entre les deux.
        $this->assertSame(
            count(LoyaltyTierSeeder::TIERS),
            LoyaltyTier::where('pressing_id', $first->json('id'))->count()
        );
        $this->assertSame(
            count(LoyaltyTierSeeder::TIERS),
            LoyaltyTier::where('pressing_id', $second->json('id'))->count()
        );
    }
}
