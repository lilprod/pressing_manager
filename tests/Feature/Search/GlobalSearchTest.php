<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class GlobalSearchTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_a_short_query_returns_empty_results_without_hitting_the_database(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/search?q=a');

        $response->assertOk();
        $response->assertExactJson(['clients' => [], 'orders' => []]);
    }

    public function test_it_finds_a_client_by_name_and_an_order_by_number(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['first_name' => 'Fatou', 'last_name' => 'Diallo']);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'order_number' => 4242]);

        $byName = $this->actingAs($accueil)->getJson('/api/search?q=Fatou');
        $byName->assertOk();
        $byName->assertJsonCount(1, 'clients');
        $byName->assertJsonPath('clients.0.id', $client->id);

        $byOrderNumber = $this->actingAs($accueil)->getJson('/api/search?q=4242');
        $byOrderNumber->assertOk();
        $byOrderNumber->assertJsonCount(1, 'orders');
        $byOrderNumber->assertJsonPath('orders.0.id', $order->id);
    }

    public function test_a_role_without_clients_manage_never_receives_client_results(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        Client::factory()->for($agency, 'agency')->create(['first_name' => 'Fatou', 'last_name' => 'Diallo']);

        $response = $this->actingAs($livreur)->getJson('/api/search?q=Fatou');

        $response->assertOk();
        $response->assertJsonPath('clients', []);
    }

    public function test_search_never_leaks_results_from_another_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        Client::factory()->for($agencyB, 'agency')->create(['first_name' => 'Fatou', 'last_name' => 'Diallo']);

        $response = $this->actingAs($accueilA)->getJson('/api/search?q=Fatou');

        $response->assertOk();
        $response->assertJsonPath('clients', []);
    }
}
