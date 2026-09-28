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

    public function test_creating_a_service_requires_the_services_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/services', [
            'code' => 'NETT-TEST',
            'name' => 'Nettoyage test',
            'category' => 'nettoyage',
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
}
