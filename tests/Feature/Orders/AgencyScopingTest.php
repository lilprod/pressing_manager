<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

    public function test_the_ready_today_filter_only_returns_orders_promised_for_today(): void
    {
        // Horloge figée à midi : un test lancé près de minuit UTC verrait "+3h" ou
        // "+2 jours" traverser une frontière de jour calendaire de façon imprévisible
        // (déjà rencontré : échec réel aux alentours de 23h54 UTC).
        Carbon::setTestNow(Carbon::parse('2026-01-15 12:00:00', 'UTC'));

        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $dueToday = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'promised_at' => now()->addHours(3)]);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'promised_at' => now()->addDays(2)]);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'promised_at' => null]);

        $response = $this->actingAs($accueil)->getJson('/api/orders?ready_today=1');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($dueToday->id, $response->json('data.0.id'));

        Carbon::setTestNow();
    }
}
