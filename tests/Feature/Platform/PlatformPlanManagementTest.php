<?php

namespace Tests\Feature\Platform;

use App\Models\PlatformPlan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformPlanManagementTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_superadmin_can_create_a_priced_plan(): void
    {
        $superadmin = $this->makePlatformUser();

        $response = $this->actingAs($superadmin, 'platform')->postJson('/api/platform/plans', [
            'name' => 'Semestriel',
            'price' => 75000,
            'duration_days' => 180,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('slug', 'semestriel');
        $response->assertJsonPath('currency', 'XOF');
    }

    public function test_a_superadmin_can_update_a_plans_price(): void
    {
        $superadmin = $this->makePlatformUser();
        $plan = PlatformPlan::create(['slug' => 'test', 'name' => 'Test', 'price' => 1000, 'duration_days' => 30, 'is_active' => true]);

        $response = $this->actingAs($superadmin, 'platform')->patchJson("/api/platform/plans/{$plan->id}", [
            'price' => 2000,
        ]);

        $response->assertOk();
        $response->assertJsonPath('price', 2000);
    }

    /**
     * Chantier « Re-audit Pressing — quotas de licence » (CLAUDE.md) : limites
     * optionnelles, nullable = illimité.
     */
    public function test_a_superadmin_can_set_quota_limits_on_a_plan(): void
    {
        $superadmin = $this->makePlatformUser();

        $response = $this->actingAs($superadmin, 'platform')->postJson('/api/platform/plans', [
            'name' => 'Business',
            'price' => 100000,
            'duration_days' => 30,
            'agencies_limit' => 6,
            'users_limit' => 100,
            'storage_limit_gb' => 5,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('agencies_limit', 6);
        $response->assertJsonPath('users_limit', 100);
        $response->assertJsonPath('storage_limit_gb', 5);
    }

    public function test_quota_limits_are_nullable_and_default_to_unlimited(): void
    {
        $superadmin = $this->makePlatformUser();

        $response = $this->actingAs($superadmin, 'platform')->postJson('/api/platform/plans', [
            'name' => 'Starter',
            'price' => 10000,
            'duration_days' => 30,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('agencies_limit', null);
        $response->assertJsonPath('users_limit', null);
        $response->assertJsonPath('storage_limit_gb', null);
    }

    public function test_an_auditeur_cannot_create_a_plan(): void
    {
        $pressing = $this->makePressing();
        $viewer = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');

        $response = $this->actingAs($viewer, 'platform')->postJson('/api/platform/plans', [
            'name' => 'X', 'price' => 1000, 'duration_days' => 30,
        ]);

        $response->assertStatus(403);
    }
}
