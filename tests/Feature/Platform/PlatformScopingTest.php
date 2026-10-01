<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/**
 * Le test le plus important de cette phase : un utilisateur non-superadmin ne doit
 * jamais voir ou modifier un pressing qui ne lui est pas affecté.
 */
class PlatformScopingTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_transverse_user_only_sees_pressings_they_are_assigned_to(): void
    {
        $assigned = $this->makePressing('Éclat Royal', 'ECL-01');
        $other = $this->makePressing('Maison Blanche', 'MB-01');
        $user = $this->makeTransversePlatformUser([$assigned->id]);

        $index = $this->actingAs($user, 'platform')->getJson('/api/platform/pressings');
        $index->assertOk();
        $names = $index->json('data.*.name');
        $this->assertContains('Éclat Royal', $names);
        $this->assertNotContains('Maison Blanche', $names);

        $this->actingAs($user, 'platform')->getJson("/api/platform/pressings/{$assigned->id}")->assertOk();
        $this->actingAs($user, 'platform')->getJson("/api/platform/pressings/{$other->id}")->assertStatus(403);
    }

    public function test_a_transverse_user_cannot_update_a_pressing_they_are_not_assigned_to(): void
    {
        $other = $this->makePressing('Prestige Clean', 'PC-01');
        $user = $this->makeTransversePlatformUser([]);

        $response = $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$other->id}", ['name' => 'Renommé']);

        $response->assertStatus(403);
    }

    public function test_a_superadmin_sees_every_pressing_regardless_of_assignments(): void
    {
        $this->makePressing('A', 'A-01');
        $this->makePressing('B', 'B-01');
        $superadmin = $this->makePlatformUser();

        $index = $this->actingAs($superadmin, 'platform')->getJson('/api/platform/pressings');

        $index->assertOk();
        $this->assertSame(2, $index->json('total'));
    }

    public function test_the_dashboard_only_aggregates_assigned_pressings_for_a_transverse_user(): void
    {
        $assigned = $this->makePressing('Éclat Royal', 'ECL-02');
        $assigned->forceFill(['agencies_count' => 5])->save();
        $other = $this->makePressing('Maison Blanche', 'MB-02');
        $other->forceFill(['agencies_count' => 100])->save();
        $user = $this->makeTransversePlatformUser([$assigned->id], 'auditeur_transverse');

        $response = $this->actingAs($user, 'platform')->getJson('/api/platform/dashboard');

        $response->assertOk();
        // Seul le pressing affecté (5) compte, jamais les 100 agences de l'autre pressing.
        $response->assertJsonPath('agences_total', 5);
        $response->assertJsonPath('license_health.total', 1);
    }

    public function test_an_auditeur_transverse_cannot_manage_pressings(): void
    {
        $pressing = $this->makePressing();
        $user = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');

        $response = $this->actingAs($user, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/suspend");

        $response->assertStatus(403);
    }

    public function test_only_licenses_manage_or_pressings_manage_can_edit_license_fields(): void
    {
        $pressing = $this->makePressing();
        $auditor = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');

        $response = $this->actingAs($auditor, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'license_expires_at' => now()->addYear()->toDateString(),
        ]);

        $response->assertStatus(403);
    }

    public function test_an_admin_transverse_can_edit_license_fields_without_the_dedicated_permission(): void
    {
        $pressing = $this->makePressing();
        // admin_transverse a pressings.manage (voir migration seed), pas licenses.manage —
        // pressings.manage doit suffire pour les champs de licence aussi.
        $user = $this->makeTransversePlatformUser([$pressing->id], 'admin_transverse');

        $response = $this->actingAs($user, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'license_expires_at' => now()->addYear()->toDateString(),
        ]);

        $response->assertOk();
    }
}
