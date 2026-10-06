<?php

namespace Tests\Feature\Platform;

use App\Models\AppSetting;
use App\Models\LoyaltyTier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/**
 * Chantier « Re-audit Pressing — édition post-création » (CLAUDE.md) : couleurs/
 * sécurité/fidélité deviennent réellement éditables depuis la console superadmin
 * après la création d'un pressing (`workshop_steps` reste volontairement
 * create-only — agency-scoped, voir UpdatePressingRequest).
 */
class PressingSettingsUpdateTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_settings_endpoint_reads_from_the_real_tables_not_the_pressing_row(): void
    {
        $pressing = $this->makePressing();
        AppSetting::current($pressing->id)->update(['primary_color' => '#112233', 'session_timeout_minutes' => 45]);
        LoyaltyTier::create(['pressing_id' => $pressing->id, 'name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05]);
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->getJson("/api/platform/pressings/{$pressing->id}/settings");

        $response->assertOk();
        $response->assertJsonPath('primary_color', '#112233');
        $response->assertJsonPath('security_policy.session_timeout_minutes', 45);
        $response->assertJsonCount(1, 'loyalty_tiers');
        $response->assertJsonPath('loyalty_tiers.0.name', 'Argent');
    }

    public function test_colors_and_security_are_actually_applied_on_update(): void
    {
        $pressing = $this->makePressing();
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'primary_color' => '#AA00AA',
            'secondary_color' => '#00AA00',
            'security_policy' => ['session_timeout_minutes' => 15, 'password_min_length' => 10],
        ]);

        $response->assertOk();
        $appSetting = AppSetting::current($pressing->id);
        $this->assertSame('#AA00AA', $appSetting->primary_color);
        $this->assertSame('#00AA00', $appSetting->secondary_color);
        $this->assertSame(15, $appSetting->session_timeout_minutes);
        $this->assertSame(10, $appSetting->password_min_length);
    }

    public function test_omitting_every_settings_field_changes_nothing(): void
    {
        $pressing = $this->makePressing();
        AppSetting::current($pressing->id)->update(['primary_color' => '#112233']);
        $user = $this->makePlatformUser();

        $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'name' => 'Nouveau nom',
        ])->assertOk();

        $this->assertSame('#112233', AppSetting::current($pressing->id)->primary_color);
    }

    public function test_updating_an_existing_tier_by_id_does_not_create_a_duplicate(): void
    {
        $pressing = $this->makePressing();
        $tier = LoyaltyTier::create(['pressing_id' => $pressing->id, 'name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05]);
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'loyalty_tiers' => [
                ['id' => $tier->id, 'name' => 'Argent+', 'min_points' => 60, 'discount_rate' => 0.06],
            ],
        ]);

        $response->assertOk();
        $this->assertSame(1, LoyaltyTier::where('pressing_id', $pressing->id)->count());
        $tier->refresh();
        $this->assertSame('Argent+', $tier->name);
        $this->assertSame(60, $tier->min_points);
    }

    public function test_a_new_tier_without_id_is_created(): void
    {
        $pressing = $this->makePressing();
        $user = $this->makePlatformUser();

        $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'loyalty_tiers' => [
                ['name' => 'Bronze', 'min_points' => 20, 'discount_rate' => 0.02],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('loyalty_tiers', [
            'pressing_id' => $pressing->id, 'name' => 'Bronze', 'min_points' => 20, 'is_active' => true,
        ]);
    }

    public function test_a_tier_removed_from_the_submitted_array_is_deactivated_not_deleted(): void
    {
        $pressing = $this->makePressing();
        $kept = LoyaltyTier::create(['pressing_id' => $pressing->id, 'name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05]);
        $removed = LoyaltyTier::create(['pressing_id' => $pressing->id, 'name' => 'Or', 'min_points' => 150, 'discount_rate' => 0.10]);
        $user = $this->makePlatformUser();

        $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'loyalty_tiers' => [
                ['id' => $kept->id, 'name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05],
            ],
        ])->assertOk();

        $this->assertTrue($kept->refresh()->is_active);
        $this->assertFalse($removed->refresh()->is_active);
        $this->assertDatabaseHas('loyalty_tiers', ['id' => $removed->id]);
    }

    public function test_a_tier_id_belonging_to_another_pressing_is_rejected(): void
    {
        $pressingA = $this->makePressing('A', 'A-01');
        $pressingB = $this->makePressing('B', 'B-01');
        $foreignTier = LoyaltyTier::create(['pressing_id' => $pressingB->id, 'name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05]);
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressingA->id}", [
            'loyalty_tiers' => [
                ['id' => $foreignTier->id, 'name' => 'Vol', 'min_points' => 50, 'discount_rate' => 0.05],
            ],
        ]);

        $response->assertStatus(404);
    }

    public function test_workshop_steps_sent_on_update_is_ignored(): void
    {
        $pressing = $this->makePressing();
        $user = $this->makePlatformUser();

        // workshop_steps n'est volontairement pas une clé validée par
        // UpdatePressingRequest — un payload qui l'inclut est simplement ignoré
        // (pas de champ à appliquer), la requête reste acceptée sur ses autres champs.
        $response = $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'name' => 'Toujours Éclat Royal',
            'workshop_steps' => ['washer_step_enabled' => false],
        ]);

        $response->assertOk();
        $response->assertJsonPath('name', 'Toujours Éclat Royal');
    }
}
