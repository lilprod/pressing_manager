<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class OrderUpdateCancelTest extends TestCase
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

    // --- Modifier le dépôt ---

    public function test_an_accueil_can_update_notes_promised_at_and_express_flag(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu', 'is_express' => false]);

        $response = $this->actingAs($accueil)->patchJson("/api/orders/{$order->id}", [
            'notes' => 'Client souhaite un retrait plus tôt.',
            'promised_at' => now()->addDay()->toIso8601String(),
            'is_express' => true,
        ]);

        $response->assertOk();
        $this->assertSame('Client souhaite un retrait plus tôt.', $order->refresh()->notes);
        $this->assertTrue((bool) $order->is_express);
    }

    public function test_updating_a_delivered_order_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'livre']);

        $response = $this->actingAs($accueil)->patchJson("/api/orders/{$order->id}", ['notes' => 'x']);

        $response->assertStatus(422);
    }

    public function test_updating_a_cancelled_order_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'annule']);

        $response = $this->actingAs($accueil)->patchJson("/api/orders/{$order->id}", ['notes' => 'x']);

        $response->assertStatus(422);
    }

    public function test_updating_an_order_requires_the_orders_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);

        $response = $this->actingAs($technicien)->patchJson("/api/orders/{$order->id}", ['notes' => 'x']);

        $response->assertStatus(403);
    }

    public function test_a_user_from_another_agency_cannot_update_the_order(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $clientB = Client::factory()->for($agencyB, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agencyB->id, 'client_id' => $clientB->id, 'status' => 'recu']);

        $response = $this->actingAs($accueilA)->patchJson("/api/orders/{$order->id}", ['notes' => 'x']);

        $response->assertStatus(403);
    }

    // --- Annuler le dépôt ---

    public function test_cancelling_an_order_without_invoice_sets_its_status_to_annule(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel", ['reason' => 'Client a changé d\'avis']);

        $response->assertOk();
        $this->assertSame('annule', $order->refresh()->status);
        $this->assertStringContainsString('Client a changé d\'avis', $order->notes);
    }

    public function test_cancelling_an_order_with_an_unpaid_invoice_also_cancels_the_invoice(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);
        $invoice = $this->makeInvoice($agency, $client, $order, 2000, 'emise');

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel");

        $response->assertOk();
        $this->assertSame('annule', $order->refresh()->status);
        $this->assertSame('annulee', $invoice->refresh()->status);
    }

    public function test_cancelling_an_order_with_a_completed_payment_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);
        $invoice = $this->makeInvoice($agency, $client, $order, 2000, 'partiellement_payee');
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'invoice_id' => $invoice->id,
            'method' => 'espece', 'amount' => 1000, 'currency' => 'XOF', 'status' => 'complete', 'paid_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel");

        $response->assertStatus(422);
        $this->assertSame('recu', $order->refresh()->status);
    }

    public function test_cancelling_an_already_delivered_order_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'livre']);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel");

        $response->assertStatus(422);
    }

    public function test_cancelling_an_already_cancelled_order_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'annule']);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel");

        $response->assertStatus(422);
    }

    public function test_cancelling_an_order_requires_the_orders_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);

        $response = $this->actingAs($technicien)->postJson("/api/orders/{$order->id}/cancel");

        $response->assertStatus(403);
    }

    public function test_no_item_status_transition_is_possible_on_a_cancelled_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $technicien = $this->makeUser('technicien', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);
        $item = OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'status' => 'recu']);

        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel")->assertOk();

        $response = $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", ['status' => 'trie']);

        $response->assertStatus(422);
        $this->assertSame('annule', $order->refresh()->status);
    }

    public function test_no_pickup_can_be_processed_on_a_cancelled_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);
        $item = OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'status' => 'pret', 'quantity' => 1]);

        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/cancel")->assertOk();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Test',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
    }
}
