<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/**
 * Phase 0 (continuité de compte) : avant cette passe, un platform_user n'avait aucun
 * moyen de changer ou réinitialiser son mot de passe après sa création — voir
 * CLAUDE.md « Licence / facturation — gap d'harmonisation ».
 */
class PlatformAccountContinuityTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_platform_user_can_change_their_own_password(): void
    {
        $user = $this->makePlatformUser('ancien-mdp-1234');

        $response = $this->actingAs($user, 'platform')->patchJson('/api/platform/me/password', [
            'current_password' => 'ancien-mdp-1234',
            'new_password' => 'NouveauMotDePasse123',
            'new_password_confirmation' => 'NouveauMotDePasse123',
        ]);

        $response->assertOk();
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('NouveauMotDePasse123', $user->fresh()->password));
    }

    public function test_changing_password_requires_the_correct_current_password(): void
    {
        $user = $this->makePlatformUser('ancien-mdp-1234');

        $response = $this->actingAs($user, 'platform')->patchJson('/api/platform/me/password', [
            'current_password' => 'mauvais-mdp',
            'new_password' => 'NouveauMotDePasse123',
            'new_password_confirmation' => 'NouveauMotDePasse123',
        ]);

        $response->assertStatus(422);
    }

    public function test_a_superadmin_can_reset_another_users_password(): void
    {
        $superadmin = $this->makePlatformUser();
        $target = $this->makePlatformUser();

        $response = $this->actingAs($superadmin, 'platform')->postJson("/api/platform/users/{$target->id}/reset-password");

        $response->assertOk();
        $response->assertJsonStructure(['temporary_password']);
        $target->refresh();
        $this->assertTrue($target->must_change_password);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check($response->json('temporary_password'), $target->password));
    }

    public function test_resetting_a_password_requires_platform_users_manage(): void
    {
        $pressing = $this->makePressing();
        $viewer = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');
        $target = $this->makePlatformUser();

        $response = $this->actingAs($viewer, 'platform')->postJson("/api/platform/users/{$target->id}/reset-password");

        $response->assertStatus(403);
    }

    public function test_resetting_a_password_logs_an_activity_entry(): void
    {
        $superadmin = $this->makePlatformUser();
        $target = $this->makePlatformUser();

        $this->actingAs($superadmin, 'platform')->postJson("/api/platform/users/{$target->id}/reset-password")->assertOk();

        $activity = $this->actingAs($superadmin, 'platform')->getJson("/api/platform/users/{$target->id}/activity");
        $this->assertContains('platform_user.password_reset', $activity->json('*.action'));
    }

    public function test_a_platform_user_can_update_their_own_name_and_phone(): void
    {
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->patchJson('/api/platform/me', [
            'name' => 'Nouveau Nom',
            'phone' => '+228 90 00 00 00',
        ]);

        $response->assertOk();
        $response->assertJsonPath('name', 'Nouveau Nom');
        $response->assertJsonPath('phone', '+228 90 00 00 00');
    }
}
