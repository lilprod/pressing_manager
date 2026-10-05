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
