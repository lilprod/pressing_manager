<?php

namespace Tests\Feature\Invoices;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class InvoiceCreationTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeOrder(Agency $agency, int $unitPrice, int $quantity, int $discount = 0): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'discount_amount' => $discount]);
        $service = Service::factory()->create(['base_price' => $unitPrice]);
        OrderItem::factory()->create([
            'order_id' => $order->id,
            'agency_id' => $agency->id,
            'service_id' => $service->id,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
        ]);

        return $order;
    }

    public function test_creating_an_invoice_computes_tax_on_the_default_rate(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrder($agency, 1000, 2); // sous-total 2000, pas de remise

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice");

        $response->assertCreated();
        $response->assertJsonPath('subtotal', 2000);
        $response->assertJsonPath('discount_amount', 0);
        $response->assertJsonPath('tax_amount', 360); // 2000 * 18%
        $response->assertJsonPath('total_amount', 2360);
    }

    public function test_tax_is_computed_after_the_discount_is_applied(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrder($agency, 1000, 2, discount: 500); // (2000 - 500) = 1500

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice");

        $response->assertCreated();
        $response->assertJsonPath('tax_amount', 270); // 1500 * 18%
        $response->assertJsonPath('total_amount', 1770); // 1500 + 270
    }

    public function test_the_tax_rate_is_configurable(): void
    {
        Config::set('invoicing.tax_rate', 0.10);
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrder($agency, 1000, 1);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice");

        $response->assertCreated();
        $response->assertJsonPath('tax_amount', 100);
        $response->assertJsonPath('total_amount', 1100);
    }

    public function test_a_pdf_is_generated_and_downloadable(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrder($agency, 1000, 1);

        $created = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->json();

        $response = $this->actingAs($accueil)->get("/api/invoices/{$created['id']}/pdf");

        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', $response->streamedContent());
    }

    public function test_cannot_create_two_invoices_for_the_same_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrder($agency, 1000, 1);

        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();
        $second = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice");

        $second->assertStatus(422);
    }

    public function test_creating_an_invoice_requires_the_invoices_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $order = $this->makeOrder($agency, 1000, 1);

        $response = $this->actingAs($technicien)->postJson("/api/orders/{$order->id}/invoice");

        $response->assertStatus(403);
    }
}
