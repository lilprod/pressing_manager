<?php

namespace Tests\Feature\Pickups;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class PickupTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeReadyOrder(Agency $agency, int $quantity = 1, int $unitPrice = 1000): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create();
        // Statut fixé directement (sans passer par le workflow réel, déjà couvert par
        // test_the_full_workflow_brings_an_order_from_recu_to_pret_and_lists_it) : il faut
        // que orders.status reflète 'pret' comme le ferait OrderStatusSynchronizer.
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

    public function test_the_full_workflow_brings_an_order_from_recu_to_pret_and_lists_it(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'recu']);
        $item = OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'status' => 'recu']);

        foreach (['trie', 'en_traitement', 'controle_qualite'] as $status) {
            $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", ['status' => $status])->assertOk();
        }
        $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ])->assertOk();

        // Régression : avant le correctif OrderStatusSynchronizer, orders.status restait
        // bloqué sur 'recu' quelle que soit la progression des articles.
        $this->assertSame('pret', $order->refresh()->status);

        $response = $this->actingAs($accueil)->getJson('/api/pickups');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($order->id, $response->json('data.0.id'));
    }

    public function test_a_full_pickup_marks_the_item_delivered_and_the_order_livre(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 2);
        $item = $order->items()->first();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 2]],
        ]);

        $response->assertCreated();
        $this->assertSame(2, $item->refresh()->quantity_delivered);
        $this->assertSame('livre', $item->status);
        $this->assertNotNull($item->delivered_at);
        $this->assertSame('livre', $order->refresh()->status);
        $this->assertNotNull($order->delivered_at);
        $this->assertDatabaseHas('order_pickups', ['order_id' => $order->id, 'recipient_name' => 'Aminata Koné']);
    }

    public function test_a_partial_pickup_keeps_the_item_ready_with_the_remaining_quantity(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 5);
        $item = $order->items()->first();

        $first = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 2]],
        ]);

        $first->assertCreated();
        $this->assertSame(2, $item->refresh()->quantity_delivered);
        $this->assertSame('pret', $item->status);
        $this->assertSame('pret', $order->refresh()->status);

        $second = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 3]],
        ]);

        $second->assertCreated();
        $this->assertSame(5, $item->refresh()->quantity_delivered);
        $this->assertSame('livre', $item->status);
        $this->assertSame('livre', $order->refresh()->status);
    }

    public function test_withdrawing_more_than_the_remaining_quantity_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 2);
        $item = $order->items()->first();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 3]],
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, $item->refresh()->quantity_delivered);
    }

    public function test_pickup_is_blocked_when_the_balance_is_unpaid(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, $item->refresh()->quantity_delivered);
    }

    /** « Paramètres opérationnels » (CLAUDE.md « Opérationnel ») : EF-RET-05, le blocage
     * est désormais désactivable par agence, sans toucher au comportement par défaut. */
    public function test_pickup_is_not_blocked_when_the_agency_disables_the_unpaid_block(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        AgencySetting::forAgency($agency->id)->update(['block_pickup_if_unpaid' => false]);
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
        ]);

        $response->assertCreated();
        $this->assertSame(1, $item->refresh()->quantity_delivered);
        $this->assertDatabaseHas('order_pickups', ['order_id' => $order->id, 'balance_overridden' => true, 'override_reason' => null]);
    }

    public function test_collecting_the_full_balance_unblocks_the_pickup(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $invoice = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->json();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'payment_amount' => $invoice['total_amount'],
        ]);

        $response->assertCreated();
        $this->assertSame('livre', $item->refresh()->status);
        $this->assertDatabaseHas('payments', ['invoice_id' => $invoice['id'], 'amount' => $invoice['total_amount'], 'status' => 'complete']);
        $this->assertDatabaseHas('invoices', ['id' => $invoice['id'], 'status' => 'payee']);
    }

    /** V1, en attendant une intégration réelle avec un agrégateur : Flooz/T-Money/
     * carte sont confirmés manuellement par le caissier avec une référence de
     * transaction, exactement comme l'espèce — débloque le retrait immédiatement,
     * pas de statut `en_attente`. */
    public function test_a_mobile_money_payment_with_a_reference_unblocks_the_pickup_like_cash(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $invoice = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->json();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'payment_amount' => $invoice['total_amount'],
            'payment_method' => 'flooz',
            'payment_reference' => 'FLZ-2026-998877',
        ]);

        $response->assertCreated();
        $this->assertSame('livre', $item->refresh()->status);
        $this->assertDatabaseHas('payments', [
            'invoice_id' => $invoice['id'],
            'method' => 'flooz',
            'status' => 'complete',
            'external_reference' => 'FLZ-2026-998877',
        ]);
        $this->assertDatabaseHas('invoices', ['id' => $invoice['id'], 'status' => 'payee']);
    }

    /** La référence de transaction est la seule preuve d'un paiement carte/mobile
     * money en V1 (pas de numéro de carte complet, jamais stocké) — elle est donc
     * obligatoire, contrairement à l'espèce qui n'en a pas besoin. */
    public function test_a_card_payment_without_a_reference_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $invoice = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->json();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'payment_amount' => $invoice['total_amount'],
            'payment_method' => 'carte',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, $item->refresh()->quantity_delivered);
    }

    public function test_an_invalid_payment_method_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'payment_amount' => 1000,
            'payment_method' => 'cheque',
        ]);

        $response->assertStatus(422);
    }

    public function test_an_override_with_a_reason_unblocks_the_pickup_despite_the_unpaid_balance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'override_unpaid' => true,
            'override_reason' => 'Cliente régulière, règlement promis demain.',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('order_pickups', ['order_id' => $order->id, 'balance_overridden' => true]);
    }

    public function test_an_override_without_a_reason_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 1, unitPrice: 2000);
        $item = $order->items()->first();
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'override_unpaid' => true,
        ]);

        $response->assertStatus(422);
    }

    public function test_a_user_from_another_agency_cannot_process_the_pickup(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilB = $this->makeUser('accueil', $agencyB);
        $order = $this->makeReadyOrder($agencyA);
        $item = $order->items()->first();

        $response = $this->actingAs($accueilB)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(403);
    }

    public function test_processing_a_pickup_requires_the_orders_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $order = $this->makeReadyOrder($agency);
        $item = $order->items()->first();

        $response = $this->actingAs($technicien)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client',
            'recipient_name' => 'Aminata Koné',
            'condition_status' => 'conforme',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(403);
    }

    public function test_the_summary_endpoint_reports_ready_orders_and_unpaid_balances(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeReadyOrder($agency, quantity: 3, unitPrice: 1000);
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->getJson('/api/pickups/summary');

        $response->assertOk();
        $response->assertJsonPath('ready_orders', 1);
        $response->assertJsonPath('pieces_ready', 3);
        $response->assertJsonPath('unpaid_orders', 1);
        $response->assertJsonPath('unpaid_amount', 3540); // 3000 + TVA 18%
    }

    public function test_the_summary_endpoint_lists_orders_due_today(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $dueToday = $this->makeReadyOrder($agency, quantity: 2);
        $dueToday->update(['promised_at' => now()]);
        $dueTomorrow = $this->makeReadyOrder($agency, quantity: 1);
        $dueTomorrow->update(['promised_at' => now()->addDay()]);

        $response = $this->actingAs($accueil)->getJson('/api/pickups/summary');

        $response->assertOk();
        $this->assertCount(1, $response->json('due_today'));
        $response->assertJsonPath('due_today.0.id', $dueToday->id);
        $response->assertJsonPath('due_today.0.pieces_remaining', 2);
        $response->assertJsonPath('due_today.0.balance_due', 0);
    }

    public function test_the_list_endpoint_can_be_filtered_by_workshop_item_status(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $ready = $this->makeReadyOrder($agency);
        $overdue = $this->makeReadyOrder($agency);
        $overdue->items()->first()->update(['status' => 'non_recupere']);

        $response = $this->actingAs($accueil)->getJson('/api/pickups?item_status=non_recupere');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($overdue->id, $response->json('data.0.id'));
    }

    public function test_the_list_endpoint_can_be_filtered_by_promised_date_range(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $inRange = $this->makeReadyOrder($agency);
        $inRange->update(['promised_at' => now()]);
        $outOfRange = $this->makeReadyOrder($agency);
        $outOfRange->update(['promised_at' => now()->addDays(10)]);

        $response = $this->actingAs($accueil)->getJson('/api/pickups?promised_from='.now()->toDateString().'&promised_to='.now()->toDateString());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($inRange->id, $response->json('data.0.id'));
    }
}
