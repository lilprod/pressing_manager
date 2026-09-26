<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class AgencyScopingTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_a_local_user_cannot_view_a_client_from_another_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $clientB = Client::factory()->for($agencyB, 'agency')->create();

        $response = $this->actingAs($accueilA)->getJson("/api/clients/{$clientB->id}");

        $response->assertStatus(403);
    }

    public function test_a_global_admin_can_view_a_client_from_any_agency(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $client = Client::factory()->for($agency, 'agency')->create();

        $response = $this->actingAs($admin)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
    }

    public function test_the_client_index_is_scoped_to_the_users_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        Client::factory()->for($agencyA, 'agency')->create();
        Client::factory()->for($agencyB, 'agency')->create();

        $response = $this->actingAs($accueilA)->getJson('/api/clients');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }
}
