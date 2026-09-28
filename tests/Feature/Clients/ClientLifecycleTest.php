<?php

namespace Tests\Feature\Clients;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ClientLifecycleTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_a_client_without_orders_can_be_deleted(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $response = $this->actingAs($accueil)->deleteJson("/api/clients/{$client->id}");

        $response->assertNoContent();
        $this->assertSoftDeleted('clients', ['id' => $client->id]);
    }

    public function test_a_client_with_orders_cannot_be_deleted(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        Order::factory()->for($agency, 'agency')->for($client, 'client')->create();

        $response = $this->actingAs($accueil)->deleteJson("/api/clients/{$client->id}");

        $response->assertStatus(409);
        $this->assertDatabaseHas('clients', ['id' => $client->id, 'deleted_at' => null]);
    }

    public function test_a_client_can_be_deactivated_and_reactivated(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['is_active' => true]);

        $this->actingAs($accueil)
            ->patchJson("/api/clients/{$client->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('is_active', false);

        $this->actingAs($accueil)
            ->patchJson("/api/clients/{$client->id}", ['is_active' => true])
            ->assertOk()
            ->assertJsonPath('is_active', true);
    }
}
