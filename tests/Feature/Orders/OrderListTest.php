<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Service;
use App\Models\TreatmentType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class OrderListTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeOrder(Agency $agency, Client $client, array $attributes = []): Order
    {
        return Order::factory()->create(array_merge([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
        ], $attributes));
    }

    public function test_search_matches_a_client_by_first_or_last_name(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $fatou = Client::factory()->for($agency, 'agency')->create(['first_name' => 'Fatou', 'last_name' => 'Diarra', 'phone' => '+22890000001']);
        $jean = Client::factory()->for($agency, 'agency')->create(['first_name' => 'Jean', 'last_name' => 'Kouassi', 'phone' => '+22890000002']);
        $this->makeOrder($agency, $fatou);
        $this->makeOrder($agency, $jean);

        $response = $this->actingAs($accueil)->getJson('/api/orders?search=diarra');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($fatou->id, $response->json('data.0.client_id'));
    }

    public function test_search_matches_a_client_by_phone(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['phone' => '+22891112233']);
        $this->makeOrder($agency, $client);
        $this->makeOrder($agency, Client::factory()->for($agency, 'agency')->create(['phone' => '+22899998888']));

        $response = $this->actingAs($accueil)->getJson('/api/orders?search=1112233');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_search_matches_a_deposit_by_its_raw_order_number(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = $this->makeOrder($agency, $client, ['order_number' => 777]);
        $this->makeOrder($agency, $client, ['order_number' => 888]);

        $response = $this->actingAs($accueil)->getJson('/api/orders?search=777');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($order->id, $response->json('data.0.id'));
    }

    public function test_invoice_status_filter_non_facture_returns_orders_without_any_invoice(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $withoutInvoice = $this->makeOrder($agency, $client);
        $withInvoice = $this->makeOrder($agency, $client);
        Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $withInvoice->id,
            'invoice_number' => 1, 'subtotal' => 1000, 'discount_amount' => 0, 'tax_amount' => 0,
            'total_amount' => 1000, 'status' => 'emise', 'issued_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/orders?invoice_status=non_facture');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($withoutInvoice->id, $response->json('data.0.id'));
    }

    public function test_invoice_status_filter_matches_a_real_invoice_status(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $paid = $this->makeOrder($agency, $client);
        Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $paid->id,
            'invoice_number' => 1, 'subtotal' => 1000, 'discount_amount' => 0, 'tax_amount' => 0,
            'total_amount' => 1000, 'status' => 'payee', 'issued_at' => now(),
        ]);
        $emise = $this->makeOrder($agency, $client);
        Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $emise->id,
            'invoice_number' => 2, 'subtotal' => 1000, 'discount_amount' => 0, 'tax_amount' => 0,
            'total_amount' => 1000, 'status' => 'emise', 'issued_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/orders?invoice_status=payee');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($paid->id, $response->json('data.0.id'));
    }

    public function test_paid_amount_and_balance_due_are_computed_per_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = $this->makeOrder($agency, $client);
        $invoice = Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $order->id,
            'invoice_number' => 1, 'subtotal' => 2000, 'discount_amount' => 0, 'tax_amount' => 0,
            'total_amount' => 2000, 'status' => 'partiellement_payee', 'issued_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'invoice_id' => $invoice->id,
            'method' => 'espece', 'amount' => 800, 'currency' => 'XOF', 'status' => 'complete', 'paid_at' => now(),
        ]);
        // Un paiement en attente ne doit pas compter.
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'invoice_id' => $invoice->id,
            'method' => 'flooz', 'amount' => 300, 'currency' => 'XOF', 'status' => 'en_attente',
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/orders');

        $response->assertOk();
        $response->assertJsonPath('data.0.paid_amount', 800);
        $response->assertJsonPath('data.0.balance_due', 1200);
    }

    public function test_an_order_without_an_invoice_has_null_paid_amount_and_balance_due(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $this->makeOrder($agency, $client);

        $response = $this->actingAs($accueil)->getJson('/api/orders');

        $response->assertOk();
        $this->assertNull($response->json('data.0.paid_amount'));
        $this->assertNull($response->json('data.0.balance_due'));
    }

    public function test_treatment_name_is_shown_only_when_uniform_across_items(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $express = TreatmentType::factory()->create(['name' => 'Express', 'price_ratio' => 1.5]);
        $classique = TreatmentType::factory()->create(['name' => 'Classique', 'price_ratio' => 1]);

        $uniform = $this->makeOrder($agency, $client);
        OrderItem::factory()->count(2)->create(['order_id' => $uniform->id, 'agency_id' => $agency->id, 'treatment_type_id' => $express->id]);

        $mixed = $this->makeOrder($agency, $client);
        OrderItem::factory()->create(['order_id' => $mixed->id, 'agency_id' => $agency->id, 'treatment_type_id' => $express->id]);
        OrderItem::factory()->create(['order_id' => $mixed->id, 'agency_id' => $agency->id, 'treatment_type_id' => $classique->id]);

        $response = $this->actingAs($accueil)->getJson('/api/orders?per_page=50');

        $response->assertOk();
        $byId = collect($response->json('data'))->keyBy('id');
        $this->assertSame('Express', $byId[$uniform->id]['treatment_name']);
        $this->assertNull($byId[$mixed->id]['treatment_name']);
    }

    public function test_pieces_count_and_weight_kg_total_are_aggregated_separately(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = $this->makeOrder($agency, $client);
        OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'quantity' => 3, 'weight_kg' => null]);
        OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'quantity' => 1, 'weight_kg' => 4.8]);

        $response = $this->actingAs($accueil)->getJson('/api/orders');

        $response->assertOk();
        $response->assertJsonPath('data.0.pieces_count', 3);
        $response->assertJsonPath('data.0.weight_kg_total', 4.8);
    }

    public function test_the_status_and_invoice_status_filters_can_be_combined(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $match = $this->makeOrder($agency, $client, ['status' => 'pret']);
        Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $match->id,
            'invoice_number' => 1, 'subtotal' => 1000, 'discount_amount' => 0, 'tax_amount' => 0,
            'total_amount' => 1000, 'status' => 'emise', 'issued_at' => now(),
        ]);
        $wrongStatus = $this->makeOrder($agency, $client, ['status' => 'recu']);
        Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $wrongStatus->id,
            'invoice_number' => 2, 'subtotal' => 1000, 'discount_amount' => 0, 'tax_amount' => 0,
            'total_amount' => 1000, 'status' => 'emise', 'issued_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/orders?status=pret&invoice_status=emise');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($match->id, $response->json('data.0.id'));
    }

    public function test_exporting_orders_returns_an_excel_file_respecting_the_same_filters(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $this->makeOrder($agency, $client, ['status' => 'pret']);
        $this->makeOrder($agency, $client, ['status' => 'recu']);

        $response = $this->actingAs($accueil)->get('/api/orders/export?status=pret');

        $response->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_period_today_excludes_deposits_created_on_other_days(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $today = $this->makeOrder($agency, $client);
        $yesterday = $this->makeOrder($agency, $client);
        $yesterday->created_at = now()->subDay();
        $yesterday->save();

        $response = $this->actingAs($accueil)->getJson('/api/orders?period=today');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($today->id, $response->json('data.0.id'));
    }

    public function test_search_is_scoped_to_the_users_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $clientB = Client::factory()->for($agencyB, 'agency')->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->makeOrder($agencyB, $clientB);

        $response = $this->actingAs($accueilA)->getJson('/api/orders?search=Awa');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }
}
