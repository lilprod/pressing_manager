<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class OrderStatsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_it_reports_todays_deposits_and_revenue(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        Order::factory()->create(['agency_id' => $agency->id, 'created_at' => now()]);
        Order::factory()->create(['agency_id' => $agency->id, 'created_at' => now()->subDays(2)]);

        $client = Client::factory()->for($agency, 'agency')->create();
        Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => 5000,
            'currency' => 'XOF',
            'status' => 'complete',
            'paid_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => 1500,
            'currency' => 'XOF',
            'status' => 'complete',
            'paid_at' => now()->subDays(3),
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

        $response = $this->actingAs($accueil)->getJson('/api/orders/stats');

        $response->assertOk();
        $response->assertJsonPath('today_count', 1);
        $response->assertJsonPath('today_revenue', 5000);
    }

    public function test_it_reports_deposits_due_today_excluding_delivered_and_cancelled(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        Order::factory()->create(['agency_id' => $agency->id, 'promised_at' => now(), 'status' => 'pret']);
        Order::factory()->create(['agency_id' => $agency->id, 'promised_at' => now(), 'status' => 'livre']);
        Order::factory()->create(['agency_id' => $agency->id, 'promised_at' => now()->addDay(), 'status' => 'pret']);

        $response = $this->actingAs($accueil)->getJson('/api/orders/stats');

        $response->assertOk();
        $response->assertJsonPath('due_today', 1);
    }

    public function test_it_reports_the_outstanding_balance_across_unpaid_invoices(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        $invoice = Invoice::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'order_id' => $order->id,
            'invoice_number' => 1,
            'subtotal' => 10000,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'total_amount' => 10000,
            'status' => 'partiellement_payee',
            'issued_at' => now(),
        ]);

        Payment::create([
            'agency_id' => $agency->id,
            'invoice_id' => $invoice->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => 4000,
            'currency' => 'XOF',
            'status' => 'complete',
            'paid_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/orders/stats');

        $response->assertOk();
        $response->assertJsonPath('outstanding_balance', 6000);
    }

    public function test_stats_are_scoped_to_the_requested_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        Order::factory()->create(['agency_id' => $agencyA->id, 'created_at' => now()]);
        Order::factory()->create(['agency_id' => $agencyB->id, 'created_at' => now()]);
        Order::factory()->create(['agency_id' => $agencyB->id, 'created_at' => now()]);

        $response = $this->actingAs($admin)->getJson("/api/orders/stats?agency_id={$agencyB->id}");

        $response->assertOk();
        $response->assertJsonPath('today_count', 2);
    }
}
