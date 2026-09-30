<?php

namespace Tests\Feature\License;

use App\Models\Agency;
use App\Models\LicensePlan;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class LicensePlanManagementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_the_three_default_plans_are_seeded_by_the_migration(): void
    {
        $this->assertSame(3, LicensePlan::count());
        $this->assertDatabaseHas('license_plans', ['slug' => 'mensuel', 'days' => 30, 'price' => 15000]);
    }

    public function test_an_admin_can_create_and_update_a_plan(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/license-plans', [
            'name' => 'Semestriel',
            'days' => 180,
            'price' => 75000,
        ]);
        $created->assertCreated();
        $created->assertJsonPath('slug', 'semestriel');

        $updated = $this->actingAs($admin)->patchJson("/api/license-plans/{$created->json('id')}", [
            'price' => 70000,
        ]);
        $updated->assertOk();
        $updated->assertJsonPath('price', 70000);
    }

    public function test_an_admin_can_deactivate_a_plan_and_it_disappears_from_the_public_list(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $plan = LicensePlan::where('slug', 'mensuel')->firstOrFail();

        $this->actingAs($admin)
            ->patchJson("/api/license-plans/{$plan->id}", ['is_active' => false])
            ->assertOk();

        $publicList = $this->actingAs($admin)->getJson('/api/license/plans');
        $publicList->assertOk();
        $this->assertFalse(collect($publicList->json())->contains('slug', 'mensuel'));

        $adminList = $this->actingAs($admin)->getJson('/api/license-plans');
        $adminList->assertOk();
        $this->assertTrue(collect($adminList->json())->contains('slug', 'mensuel'));
    }

    public function test_an_admin_can_delete_a_plan(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $plan = LicensePlan::create(['slug' => 'test', 'name' => 'Test', 'days' => 10, 'price' => 1000]);

        $response = $this->actingAs($admin)->deleteJson("/api/license-plans/{$plan->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('license_plans', ['id' => $plan->id]);
    }

    public function test_a_non_admin_cannot_manage_plans(): void
    {
        $this->seedRbac();
        $accueil = $this->makeUser('accueil', Agency::factory()->create());

        $this->actingAs($accueil)->postJson('/api/license-plans', ['name' => 'X', 'days' => 10, 'price' => 1000])
            ->assertStatus(403);
    }

    public function test_renewing_with_an_inactive_plan_is_rejected(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        LicensePlan::where('slug', 'mensuel')->update(['is_active' => false]);

        $response = $this->actingAs($admin)->postJson('/api/license/renew', [
            'plan' => 'mensuel',
            'method' => 'espece',
        ]);

        $response->assertStatus(422);
    }
}
