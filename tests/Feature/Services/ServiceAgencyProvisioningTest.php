<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Service;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ServiceAgencyProvisioningTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_a_new_service_is_available_in_every_active_agency_of_the_pressing(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->for($agencyA->pressing, 'pressing')->create();
        $inactiveAgency = Agency::factory()->for($agencyA->pressing, 'pressing')->create(['is_active' => false]);
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'NEW-01', 'name' => 'Nouveau service', 'category' => 'nettoyage',
            'billing_mode' => 'piece', 'base_price' => 1500, 'estimated_duration_hours' => 24,
        ]);

        $response->assertCreated();
        $serviceId = $response->json('id');

        $this->assertDatabaseHas('agency_services', ['agency_id' => $agencyA->id, 'service_id' => $serviceId, 'is_active' => true]);
        $this->assertDatabaseHas('agency_services', ['agency_id' => $agencyB->id, 'service_id' => $serviceId, 'is_active' => true]);
        $this->assertDatabaseMissing('agency_services', ['agency_id' => $inactiveAgency->id, 'service_id' => $serviceId]);
    }

    public function test_the_new_service_is_immediately_purchasable_at_the_counter(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/services', [
            'code' => 'NEW-02', 'name' => 'Nouveau service 2', 'category' => 'nettoyage',
            'billing_mode' => 'piece', 'base_price' => 1000, 'estimated_duration_hours' => 24,
        ])->json();

        $response = $this->actingAs($admin)->getJson("/api/services?agency_id={$agency->id}");

        $response->assertOk();
        $this->assertTrue(collect($response->json())->pluck('id')->contains($created['id']));
    }
}
