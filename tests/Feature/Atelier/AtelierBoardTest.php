<?php

namespace Tests\Feature\Atelier;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class AtelierBoardTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    /**
     * Les factories n'appellent pas OrderStatusSynchronizer (seul OrderItemStatusTransitioner
     * le fait) : orders.status est donc aligné ici sur le statut de l'article, sauf
     * override explicite, pour que les fixtures reflètent un état cohérent.
     */
    private function makeOrderWithItem(Agency $agency, array $orderAttrs = [], array $itemAttrs = []): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create();
        $orderAttrs = array_merge(['status' => $itemAttrs['status'] ?? 'recu'], $orderAttrs);
        $order = Order::factory()->create(array_merge(['agency_id' => $agency->id, 'client_id' => $client->id], $orderAttrs));
        $service = Service::factory()->create();
        OrderItem::factory()->create(array_merge([
            'order_id' => $order->id,
            'agency_id' => $agency->id,
            'service_id' => $service->id,
        ], $itemAttrs));

        return $order->fresh();
    }

    public function test_the_board_requires_an_agency_for_a_global_user(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->getJson('/api/atelier/board');

        $response->assertStatus(422);
    }

    public function test_the_board_groups_orders_into_the_right_columns(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $waiting = $this->makeOrderWithItem($agency, [], ['status' => 'recu']);
        $inProgress = $this->makeOrderWithItem($agency, [], ['status' => 'en_traitement']);
        $processed = $this->makeOrderWithItem($agency, [], ['status' => 'controle_qualite', 'quality_check_result' => 'ok']);
        $sorted = $this->makeOrderWithItem($agency, [], ['status' => 'pret']);
        // Livré/annulé : ne doit pas apparaître sur le tableau.
        $this->makeOrderWithItem($agency, ['status' => 'livre'], ['status' => 'livre']);

        $response = $this->actingAs($technicien)->getJson("/api/atelier/board?agency_id={$agency->id}");

        $response->assertOk();
        $byId = collect($response->json('orders'))->keyBy('id');
        $this->assertSame('attente', $byId[$waiting->id]['column']);
        $this->assertSame('cours', $byId[$inProgress->id]['column']);
        $this->assertSame('traites', $byId[$processed->id]['column']);
        $this->assertSame('classes', $byId[$sorted->id]['column']);
        $this->assertCount(4, $byId);
    }

    public function test_the_board_reports_capacity_from_the_agency_or_the_config_default(): void
    {
        $this->seedRbac();
        $agencyWithCapacity = Agency::factory()->create(['workshop_capacity' => 10]);
        $agencyWithoutCapacity = Agency::factory()->create(['workshop_capacity' => null]);
        $technicien = $this->makeUser('technicien', $agencyWithCapacity);
        $technicien2 = $this->makeUser('technicien', $agencyWithoutCapacity);

        $this->makeOrderWithItem($agencyWithCapacity, [], ['status' => 'recu']);
        $this->makeOrderWithItem($agencyWithCapacity, [], ['status' => 'en_traitement']);

        $response = $this->actingAs($technicien)->getJson("/api/atelier/board?agency_id={$agencyWithCapacity->id}");
        $response->assertOk();
        $response->assertJsonPath('capacity', 10);
        $response->assertJsonPath('active_count', 2);

        $response2 = $this->actingAs($technicien2)->getJson("/api/atelier/board?agency_id={$agencyWithoutCapacity->id}");
        $response2->assertOk();
        $response2->assertJsonPath('capacity', config('atelier.default_capacity'));
    }

    public function test_the_board_flags_a_late_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $late = $this->makeOrderWithItem($agency, ['promised_at' => now()->subHour()], ['status' => 'en_traitement']);
        $onTime = $this->makeOrderWithItem($agency, ['promised_at' => now()->addHour()], ['status' => 'en_traitement']);

        $response = $this->actingAs($technicien)->getJson("/api/atelier/board?agency_id={$agency->id}");

        $byId = collect($response->json('orders'))->keyBy('id');
        $this->assertTrue($byId[$late->id]['is_late']);
        $this->assertFalse($byId[$onTime->id]['is_late']);
    }

    public function test_an_express_order_defaults_to_urgent_priority_and_standard_to_normale(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['billing_mode' => 'piece', 'base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $expressResponse = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'is_express' => true,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
        ]);
        $expressResponse->assertCreated();
        $this->assertSame('urgent', $expressResponse->json('priority'));

        $standardResponse = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'is_express' => false,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
        ]);
        $standardResponse->assertCreated();
        $this->assertSame('normale', $standardResponse->json('priority'));
    }

    public function test_advancing_an_order_walks_its_items_through_every_real_status_to_the_next_column(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        // "recu" est dans la colonne "attente" : avancer doit traverser "trie" PUIS
        // atteindre "en_traitement" (entrée de la colonne "cours"), sans rien sauter.
        $order = $this->makeOrderWithItem($agency, [], ['status' => 'recu']);

        $response = $this->actingAs($technicien)->postJson("/api/atelier/orders/{$order->id}/advance");

        $response->assertOk();
        $item = $order->items()->first();
        $this->assertSame('en_traitement', $item->fresh()->status);
        $this->assertSame('en_traitement', $order->fresh()->status);
        $this->assertDatabaseHas('order_item_status_histories', ['order_item_id' => $item->id, 'from_status' => 'recu', 'to_status' => 'trie']);
        $this->assertDatabaseHas('order_item_status_histories', ['order_item_id' => $item->id, 'from_status' => 'trie', 'to_status' => 'en_traitement']);
    }

    public function test_advancing_from_quality_control_to_sorted_automatically_passes_the_check(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $order = $this->makeOrderWithItem($agency, [], ['status' => 'controle_qualite']);

        $response = $this->actingAs($technicien)->postJson("/api/atelier/orders/{$order->id}/advance");

        $response->assertOk();
        $this->assertSame('pret', $order->fresh()->status);
        $item = $order->items()->first()->fresh();
        $this->assertSame('ok', $item->quality_check_result);
    }

    public function test_an_order_already_sorted_cannot_be_advanced_further(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $order = $this->makeOrderWithItem($agency, [], ['status' => 'pret']);

        $response = $this->actingAs($technicien)->postJson("/api/atelier/orders/{$order->id}/advance");

        $response->assertStatus(422);
    }

    public function test_a_manager_can_assign_washer_and_sorter_within_the_same_agency(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $washer = $this->makeUser('technicien', $agency);
        $sorter = $this->makeUser('technicien', $agency);
        $order = $this->makeOrderWithItem($agency);

        $response = $this->actingAs($manager)->patchJson("/api/atelier/orders/{$order->id}/responsables", [
            'washer_id' => $washer->id,
            'sorter_id' => $sorter->id,
        ]);

        $response->assertOk();
        $this->assertSame($washer->id, $order->fresh()->washer_id);
        $this->assertSame($sorter->id, $order->fresh()->sorter_id);
    }

    public function test_assigning_a_responsible_from_another_agency_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $otherAgency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $outsider = $this->makeUser('technicien', $otherAgency);
        $order = $this->makeOrderWithItem($agency);

        $response = $this->actingAs($manager)->patchJson("/api/atelier/orders/{$order->id}/responsables", [
            'washer_id' => $outsider->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_a_manager_can_change_the_priority_of_an_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $order = $this->makeOrderWithItem($agency);

        $response = $this->actingAs($manager)->patchJson("/api/atelier/orders/{$order->id}/priority", ['priority' => 'haute']);

        $response->assertOk();
        $this->assertSame('haute', $order->fresh()->priority);
    }

    public function test_a_technicien_can_list_the_agencys_staff_for_responsable_assignment(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->getJson("/api/atelier/staff?agency_id={$agency->id}");

        $response->assertOk();
        $this->assertCount(2, $response->json());
    }
}
