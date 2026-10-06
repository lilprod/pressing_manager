<?php

namespace Tests\Feature\StaffAlerts;

use App\Models\Agency;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Service;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class StaffAlertsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeReadyOrder(Agency $agency, int $quantity = 1, int $unitPrice = 1000): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'pret']);
        $service = Service::factory()->create(['base_price' => $unitPrice]);
        OrderItem::factory()->create([
            'order_id' => $order->id,
            'agency_id' => $agency->id,
            'service_id' => $service->id,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'status' => 'pret',
        ]);

        return $order;
    }

    public function test_it_reports_no_alerts_when_nothing_is_pending(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/staff-alerts');

        $response->assertOk();
        $response->assertExactJson(['alerts' => [], 'total' => 0]);
    }

    public function test_it_reports_pending_cash_movements(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'autre',
            'amount' => 300000, 'reason' => 'Achat matériel', 'status' => 'en_attente', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/staff-alerts');

        $response->assertOk();
        $response->assertJsonCount(1, 'alerts');
        $response->assertJsonPath('alerts.0.type', 'cash_movement_pending');
        $response->assertJsonPath('alerts.0.count', 1);
        $response->assertJsonPath('total', 1);
    }

    public function test_it_reports_blocked_pickups_for_unpaid_balances(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 2, unitPrice: 1000);
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->getJson('/api/staff-alerts');

        $response->assertOk();
        $response->assertJsonCount(1, 'alerts');
        $response->assertJsonPath('alerts.0.type', 'pickup_blocked');
        $response->assertJsonPath('alerts.0.count', 1);
    }

    public function test_a_role_without_payments_manage_never_sees_cash_alerts(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'autre',
            'amount' => 300000, 'reason' => 'Achat matériel', 'status' => 'en_attente', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($livreur)->getJson('/api/staff-alerts');

        $response->assertOk();
        $response->assertExactJson(['alerts' => [], 'total' => 0]);
    }

    public function test_alerts_are_scoped_to_the_users_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        CashMovement::create([
            'agency_id' => $agencyB->id, 'type' => 'sortie', 'category' => 'autre',
            'amount' => 300000, 'reason' => 'Achat matériel', 'status' => 'en_attente', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueilA)->getJson('/api/staff-alerts');

        $response->assertOk();
        $response->assertExactJson(['alerts' => [], 'total' => 0]);
    }
}
