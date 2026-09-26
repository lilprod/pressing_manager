<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class OrderItemStatusTransitionTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeItem(Agency $agency, string $status = 'recu'): OrderItem
    {
        $order = Order::factory()->create(['agency_id' => $agency->id]);

        return OrderItem::factory()->create([
            'order_id' => $order->id,
            'agency_id' => $agency->id,
            'status' => $status,
        ]);
    }

    public function test_a_valid_transition_is_accepted(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $item = $this->makeItem($agency, 'recu');

        $response = $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'trie',
        ]);

        $response->assertOk();
        $this->assertSame('trie', $item->refresh()->status);
        $this->assertDatabaseHas('order_item_status_histories', [
            'order_item_id' => $item->id,
            'from_status' => 'recu',
            'to_status' => 'trie',
        ]);
    }

    public function test_skipping_workflow_steps_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $item = $this->makeItem($agency, 'recu');

        $response = $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'livre',
        ]);

        $response->assertStatus(422);
        $this->assertSame('recu', $item->refresh()->status);
    }

    public function test_quality_check_must_pass_to_move_to_ready(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $item = $this->makeItem($agency, 'controle_qualite');

        $rejected = $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'pret',
        ]);
        $rejected->assertStatus(422);

        $accepted = $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ]);
        $accepted->assertOk();
        $this->assertNotNull($item->refresh()->ready_at);
    }

    public function test_a_failed_quality_check_returns_the_item_to_processing(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $item = $this->makeItem($agency, 'controle_qualite');

        $response = $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'en_traitement',
            'quality_check_result' => 'echec',
            'quality_check_notes' => 'Tache non partie',
        ]);

        $response->assertOk();
        $this->assertSame('en_traitement', $item->refresh()->status);
    }

    public function test_a_user_from_another_agency_cannot_change_the_status(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $technicienB = $this->makeUser('technicien', $agencyB);
        $item = $this->makeItem($agencyA, 'recu');

        $response = $this->actingAs($technicienB)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'trie',
        ]);

        $response->assertStatus(403);
    }
}
