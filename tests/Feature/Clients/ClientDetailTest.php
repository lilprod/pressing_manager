<?php

namespace Tests\Feature\Clients;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPickup;
use App\Models\Payment;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class ClientDetailTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_showing_a_client_includes_deposits_count_and_average_basket(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'total_amount' => 6000]);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'total_amount' => 4000]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('deposits_count', 2);
        $response->assertJsonPath('average_basket', 5000);
    }

    public function test_showing_a_client_includes_lifetime_value_from_completed_payments(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => 3000,
            'currency' => 'XOF',
            'status' => 'complete',
            'paid_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => 999,
            'currency' => 'XOF',
            'status' => 'en_attente',
            'paid_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('lifetime_value', 3000);
    }

    public function test_showing_a_client_includes_the_balance_due_across_unpaid_invoices(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        Invoice::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'order_id' => $order->id,
            'invoice_number' => 1,
            'subtotal' => 8000,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'total_amount' => 8000,
            'status' => 'emise',
            'issued_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('balance_due', 8000);
    }

    public function test_showing_a_client_includes_its_recent_pickups(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $service = Service::factory()->create();
        OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'service_id' => $service->id]);

        OrderPickup::create([
            'order_id' => $order->id,
            'agency_id' => $agency->id,
            'recipient_type' => 'client',
            'recipient_name' => 'Jean Dupont',
            'condition_status' => 'conforme',
            'processed_by' => $accueil->id,
            'processed_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'recent_pickups');
        $response->assertJsonPath('recent_pickups.0.recipient_name', 'Jean Dupont');
    }
}
