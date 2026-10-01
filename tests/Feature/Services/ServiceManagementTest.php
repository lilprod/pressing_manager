<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Service;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ServiceManagementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_create_and_update_a_service(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'NETT-TEST',
            'name' => 'Nettoyage test',
            'category' => 'nettoyage',
            'billing_mode' => 'piece',
            'base_price' => 1000,
            'estimated_duration_hours' => 24,
        ]);
        $created->assertCreated();

        $updated = $this->actingAs($admin)->patchJson("/api/services/{$created->json('id')}", [
            'base_price' => 1200,
        ]);
        $updated->assertOk();
        $updated->assertJsonPath('base_price', 1200);
    }

    public function test_a_service_defaults_to_standard_priority(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'NETT-PRIO',
            'name' => 'Nettoyage priorité',
            'category' => 'nettoyage',
            'billing_mode' => 'piece',
            'base_price' => 1000,
            'estimated_duration_hours' => 24,
        ]);

        $created->assertCreated();
        $created->assertJsonPath('priority', 'standard');
    }

    public function test_an_admin_can_set_a_service_to_high_priority(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'NETT-HAUTE',
            'name' => 'Nettoyage express',
            'category' => 'nettoyage',
            'billing_mode' => 'piece',
            'base_price' => 1000,
            'estimated_duration_hours' => 24,
            'priority' => 'haute',
        ]);
        $created->assertCreated();
        $created->assertJsonPath('priority', 'haute');

        $updated = $this->actingAs($admin)->patchJson("/api/services/{$created->json('id')}", [
            'priority' => 'standard',
        ]);
        $updated->assertOk();
        $updated->assertJsonPath('priority', 'standard');
    }

    public function test_an_invalid_service_priority_is_rejected(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'NETT-BAD',
            'name' => 'Nettoyage invalide',
            'category' => 'nettoyage',
            'billing_mode' => 'piece',
            'base_price' => 1000,
            'estimated_duration_hours' => 24,
            'priority' => 'urgente',
        ])->assertStatus(422);
    }

    public function test_an_admin_can_fetch_a_single_service(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['name' => 'Nettoyage costume']);

        $response = $this->actingAs($admin)->getJson("/api/services/{$service->id}");

        $response->assertOk();
        $response->assertJsonPath('id', $service->id);
        $response->assertJsonPath('name', 'Nettoyage costume');
    }

    public function test_fetching_a_single_service_with_an_agency_id_embeds_the_agency_pivot(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $service = Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true, 'price_override' => 1800]);

        $response = $this->actingAs($admin)->getJson("/api/services/{$service->id}?agency_id={$agency->id}");

        $response->assertOk();
        $response->assertJsonPath('agency_pivot.price_override', 1800);
        $response->assertJsonPath('agency_pivot.is_active', true);
    }

    public function test_fetching_a_single_service_requires_the_services_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $service = Service::factory()->create();

        $response = $this->actingAs($technicien)->getJson("/api/services/{$service->id}");

        $response->assertStatus(403);
    }

    public function test_creating_a_service_requires_the_services_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/services', [
            'code' => 'NETT-TEST',
            'name' => 'Nettoyage test',
            'category' => 'nettoyage',
            'billing_mode' => 'piece',
            'base_price' => 1000,
            'estimated_duration_hours' => 24,
        ]);

        $response->assertStatus(403);
    }

    public function test_an_agency_price_override_changes_the_effective_price_for_that_agency_only(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $service = Service::factory()->create(['base_price' => 1000]);
        $agencyA->services()->attach($service->id, ['is_active' => true]);
        $agencyB->services()->attach($service->id, ['is_active' => true]);

        $this->actingAs($admin)
            ->patchJson("/api/agencies/{$agencyA->id}/services/{$service->id}", ['price_override' => 1500])
            ->assertOk();

        $accueilA = $this->makeUser('accueil', $agencyA);
        $accueilB = $this->makeUser('accueil', $agencyB);

        $this->actingAs($accueilA)->getJson('/api/services')
            ->assertJsonFragment(['id' => $service->id, 'effective_price' => 1500]);

        $this->actingAs($accueilB)->getJson('/api/services')
            ->assertJsonFragment(['id' => $service->id, 'effective_price' => 1000]);
    }

    public function test_creating_a_kg_billed_service_requires_price_tiers(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $missingTiers = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'KG-TEST', 'name' => 'Linge de maison', 'category' => 'lavage',
            'billing_mode' => 'kg', 'estimated_duration_hours' => 24,
        ]);
        $missingTiers->assertStatus(422);

        $created = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'KG-TEST', 'name' => 'Linge de maison', 'category' => 'lavage',
            'billing_mode' => 'kg', 'estimated_duration_hours' => 24,
            'price_tiers' => [
                ['weight_min' => 0, 'weight_max' => 3, 'price_per_kg' => 1500],
                ['weight_min' => 3.01, 'weight_max' => 8, 'price_per_kg' => 1200],
                ['weight_min' => 8.01, 'weight_max' => null, 'price_per_kg' => 1000],
            ],
        ]);
        $created->assertCreated();
        $this->assertCount(3, $created->json('price_tiers'));
    }

    public function test_updating_the_base_price_logs_a_history_entry(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['base_price' => 1000]);

        $this->actingAs($admin)->patchJson("/api/services/{$service->id}", ['base_price' => 1200])->assertOk();

        $this->assertDatabaseHas('service_price_histories', [
            'service_id' => $service->id, 'field' => 'base_price', 'old_value' => '1000', 'new_value' => '1200',
        ]);

        // Pas de nouvelle entrée si le prix ne change pas réellement.
        $this->actingAs($admin)->patchJson("/api/services/{$service->id}", ['base_price' => 1200])->assertOk();
        $this->assertSame(1, \App\Models\ServicePriceHistory::where('service_id', $service->id)->count());
    }

    public function test_the_stats_endpoint_summarizes_the_catalog(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Service::factory()->create(['is_active' => true, 'category' => 'nettoyage', 'base_price' => 1000]);
        Service::factory()->create(['is_active' => true, 'category' => 'repassage', 'base_price' => 2000]);
        Service::factory()->create(['is_active' => false, 'category' => 'nettoyage', 'base_price' => 3000]);

        $response = $this->actingAs($admin)->getJson('/api/services/stats');

        $response->assertOk();
        $response->assertJsonPath('active_count', 2);
        $response->assertJsonPath('category_count', 2);
    }
}
