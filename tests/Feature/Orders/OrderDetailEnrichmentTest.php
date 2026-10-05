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

class OrderDetailEnrichmentTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeInvoice(Agency $agency, Client $client, Order $order, int $total, string $status): Invoice
    {
        return Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $order->id,
            'invoice_number' => random_int(100000, 999999), 'subtotal' => $total, 'discount_amount' => 0,
            'tax_amount' => 0, 'total_amount' => $total, 'status' => $status, 'issued_at' => now(),
        ]);
    }

    public function test_the_client_card_reports_outstanding_balance_from_other_orders_only(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $viewedOrder = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $this->makeInvoice($agency, $client, $viewedOrder, 2000, 'emise');

        $otherOrder = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $this->makeInvoice($agency, $client, $otherOrder, 1500, 'emise');

        $response = $this->actingAs($accueil)->getJson("/api/orders/{$viewedOrder->id}");

        $response->assertOk();
        $response->assertJsonPath('balance_due', 2000);
        $response->assertJsonPath('client.other_balance_due', 1500);
    }

    public function test_a_client_with_no_other_outstanding_balance_reports_zero(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $this->makeInvoice($agency, $client, $order, 1000, 'emise');

        $response = $this->actingAs($accueil)->getJson("/api/orders/{$order->id}");

        $response->assertOk();
        $response->assertJsonPath('client.other_balance_due', 0);
    }

    public function test_payments_expose_their_receiver_name_without_overwriting_the_raw_column(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $cashier = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $invoice = $this->makeInvoice($agency, $client, $order, 1000, 'partiellement_payee');
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'invoice_id' => $invoice->id,
            'method' => 'espece', 'amount' => 1000, 'currency' => 'XOF', 'status' => 'complete',
            'paid_at' => now(), 'received_by' => $cashier->id,
        ]);

        $response = $this->actingAs($accueil)->getJson("/api/orders/{$order->id}");

        $response->assertOk();
        $response->assertJsonPath('invoice.0.payments.0.receiver.id', $cashier->id);
        $response->assertJsonPath('invoice.0.payments.0.receiver.name', $cashier->name);
    }

    public function test_the_invoice_show_endpoint_also_exposes_payment_receivers(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $cashier = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $invoice = $this->makeInvoice($agency, $client, $order, 1000, 'partiellement_payee');
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'invoice_id' => $invoice->id,
            'method' => 'espece', 'amount' => 1000, 'currency' => 'XOF', 'status' => 'complete',
            'paid_at' => now(), 'received_by' => $cashier->id,
        ]);

        $response = $this->actingAs($accueil)->getJson("/api/invoices/{$invoice->id}");

        $response->assertOk();
        $response->assertJsonPath('payments.0.receiver.name', $cashier->name);
    }
}
