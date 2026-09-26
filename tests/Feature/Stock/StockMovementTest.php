<?php

namespace Tests\Feature\Stock;

use App\Models\Agency;
use App\Models\StockItem;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class StockMovementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_recording_an_entree_increases_the_agency_stock_level(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager');
        $item = StockItem::factory()->create(['default_reorder_threshold' => 5]);
        $supplier = Supplier::factory()->create();

        $response = $this->actingAs($manager)->postJson('/api/stock-movements', [
            'agency_id' => $agency->id,
            'stock_item_id' => $item->id,
            'type' => 'entree',
            'quantity' => 20,
            'supplier_id' => $supplier->id,
            'reason' => 'livraison',
        ]);

        $response->assertCreated();

        $levels = $this->actingAs($manager)->getJson("/api/stock?agency_id={$agency->id}");
        $levels->assertOk();
        $row = collect($levels->json())->firstWhere('stock_item_id', $item->id);
        $this->assertSame(20, $row['quantity_on_hand']);
        $this->assertFalse($row['is_low_stock']);
    }

    public function test_a_sortie_decreases_the_stock_and_can_flag_low_stock(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager');
        $item = StockItem::factory()->create(['default_reorder_threshold' => 5]);

        $this->actingAs($manager)->postJson('/api/stock-movements', [
            'agency_id' => $agency->id,
            'stock_item_id' => $item->id,
            'type' => 'entree',
            'quantity' => 10,
            'reason' => 'livraison',
        ])->assertCreated();

        $this->actingAs($manager)->postJson('/api/stock-movements', [
            'agency_id' => $agency->id,
            'stock_item_id' => $item->id,
            'type' => 'sortie',
            'quantity' => 7,
            'reason' => 'consommation',
        ])->assertCreated();

        $levels = $this->actingAs($manager)->getJson("/api/stock?agency_id={$agency->id}");
        $row = collect($levels->json())->firstWhere('stock_item_id', $item->id);
        $this->assertSame(3, $row['quantity_on_hand']);
        $this->assertTrue($row['is_low_stock']);
    }

    public function test_a_sortie_cannot_exceed_the_available_quantity(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager');
        $item = StockItem::factory()->create();

        $response = $this->actingAs($manager)->postJson('/api/stock-movements', [
            'agency_id' => $agency->id,
            'stock_item_id' => $item->id,
            'type' => 'sortie',
            'quantity' => 5,
            'reason' => 'consommation',
        ]);

        $response->assertStatus(422);
    }

    public function test_stock_levels_are_scoped_per_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager');
        $item = StockItem::factory()->create();

        $this->actingAs($managerA)->postJson('/api/stock-movements', [
            'agency_id' => $agencyA->id,
            'stock_item_id' => $item->id,
            'type' => 'entree',
            'quantity' => 15,
            'reason' => 'livraison',
        ])->assertCreated();

        $levelsB = $this->actingAs($managerA)->getJson("/api/stock?agency_id={$agencyB->id}");
        $row = collect($levelsB->json())->firstWhere('stock_item_id', $item->id);
        $this->assertSame(0, $row['quantity_on_hand']);
    }

    public function test_a_role_without_stocks_permission_cannot_record_a_movement(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $item = StockItem::factory()->create();

        $response = $this->actingAs($accueil)->postJson('/api/stock-movements', [
            'agency_id' => $agency->id,
            'stock_item_id' => $item->id,
            'type' => 'entree',
            'quantity' => 5,
            'reason' => 'livraison',
        ]);

        $response->assertStatus(403);
    }

    public function test_a_local_user_records_a_movement_without_supplying_agency_id(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $item = StockItem::factory()->create();

        $response = $this->actingAs($manager)->postJson('/api/stock-movements', [
            'stock_item_id' => $item->id,
            'type' => 'entree',
            'quantity' => 5,
            'reason' => 'livraison',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('agency_id', $agency->id);
    }
}
