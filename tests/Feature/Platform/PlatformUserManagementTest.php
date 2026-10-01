<?php

namespace Tests\Feature\Platform;

use App\Models\PlatformRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformUserManagementTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_superadmin_can_create_a_transverse_user_with_assigned_pressings(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressing = $this->makePressing();
        $role = PlatformRole::where('slug', 'admin_transverse')->firstOrFail();

        $response = $this->actingAs($superadmin, 'platform')->postJson('/api/platform/users', [
            'name' => 'Clarisse Mballa',
            'email' => 'clarisse@spark-pressing.test',
            'platform_role_id' => $role->id,
            'pressing_ids' => [$pressing->id],
        ]);

        $response->assertCreated();
        $response->assertJsonStructure(['id', 'temporary_password']);
        $this->assertNotEmpty($response->json('temporary_password'));
        $this->assertCount(1, $response->json('pressings'));
    }

    public function test_stats_reports_real_counts(): void
    {
        $superadmin = $this->makePlatformUser(); // MFA confirmée, actif
        \App\Models\PlatformUser::factory()->create([
            'platform_role_id' => PlatformRole::where('slug', 'superadmin')->value('id'),
            'is_active' => false,
        ]); // MFA non configurée, suspendu

        $response = $this->actingAs($superadmin, 'platform')->getJson('/api/platform/users/stats');

        $response->assertOk();
        $this->assertSame(2, $response->json('total'));
        $this->assertSame(1, $response->json('pending_setup_count'));
        $this->assertSame(1, $response->json('suspended_count'));
        $this->assertEquals(50.0, $response->json('mfa_enabled_pct'));
    }

    public function test_listing_users_requires_platform_users_manage(): void
    {
        $pressing = $this->makePressing();
        $viewer = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');

        $response = $this->actingAs($viewer, 'platform')->getJson('/api/platform/users');

        $response->assertStatus(403);
    }

    public function test_filtering_users_by_mfa_status(): void
    {
        $this->makePlatformUser(); // MFA confirmée
        \App\Models\PlatformUser::factory()->create([
            'platform_role_id' => PlatformRole::where('slug', 'superadmin')->value('id'),
        ]); // MFA jamais configurée

        $viewer = $this->makePlatformUser();

        $mfaOn = $this->actingAs($viewer, 'platform')->getJson('/api/platform/users?security=mfa_on');
        $mfaOff = $this->actingAs($viewer, 'platform')->getJson('/api/platform/users?security=mfa_off');

        $this->assertGreaterThanOrEqual(1, $mfaOn->json('total'));
        $this->assertGreaterThanOrEqual(1, $mfaOff->json('total'));
    }

    public function test_suspending_a_user_toggles_is_active(): void
    {
        $superadmin = $this->makePlatformUser();
        $target = $this->makePlatformUser();

        $response = $this->actingAs($superadmin, 'platform')->patchJson("/api/platform/users/{$target->id}", [
            'is_active' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('is_active', false);
    }

    public function test_changing_assignments_logs_an_activity_entry(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressingA = $this->makePressing('A', 'A-01');
        $pressingB = $this->makePressing('B', 'B-01');
        $target = $this->makeTransversePlatformUser([$pressingA->id]);

        $this->actingAs($superadmin, 'platform')->patchJson("/api/platform/users/{$target->id}", [
            'pressing_ids' => [$pressingB->id],
        ])->assertOk();

        $activity = $this->actingAs($superadmin, 'platform')->getJson("/api/platform/users/{$target->id}/activity");
        $activity->assertOk();
        $actions = $activity->json('*.action');
        $this->assertContains('platform_user.assignment_changed', $actions);
    }

    public function test_an_unchanged_assignment_list_does_not_log_a_duplicate_entry(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressing = $this->makePressing();
        $target = $this->makeTransversePlatformUser([$pressing->id]);

        $this->actingAs($superadmin, 'platform')->patchJson("/api/platform/users/{$target->id}", [
            'pressing_ids' => [$pressing->id],
        ])->assertOk();

        $activity = $this->actingAs($superadmin, 'platform')->getJson("/api/platform/users/{$target->id}/activity");
        $actions = $activity->json('*.action');
        $this->assertNotContains('platform_user.assignment_changed', $actions);
    }
}
