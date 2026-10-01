<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class OrderCreationTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_creating_an_order_computes_the_total_from_its_items(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 2],
            ],
        ]);

        $response->assertCreated();
        $this->assertSame(2000, $response->json('total_amount'));
        $this->assertCount(1, $response->json('items'));
    }

    public function test_resyncing_the_same_offline_order_does_not_duplicate_it(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true]);
        $localUuid = (string) \Illuminate\Support\Str::uuid();

        $payload = [
            'client_id' => $client->id,
            'client_local_uuid' => $localUuid,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
        ];

        $first = $this->actingAs($accueil)->postJson('/api/orders', $payload);
        $first->assertCreated();

        $second = $this->actingAs($accueil)->postJson('/api/orders', $payload);
        $second->assertOk();

        $this->assertSame($first->json('id'), $second->json('id'));
        $this->assertSame(1, Order::where('client_local_uuid', $localUuid)->count());
    }

    public function test_promised_at_is_auto_computed_from_the_longest_service_duration(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $fastService = Service::factory()->create(['estimated_duration_hours' => 6]);
        $slowService = Service::factory()->create(['estimated_duration_hours' => 48]);
        $agency->services()->attach([$fastService->id, $slowService->id], ['is_active' => true]);

        $this->travelTo(now()->startOfSecond());
        $frozenNow = now();

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $fastService->id, 'quantity' => 1],
                ['service_id' => $slowService->id, 'quantity' => 1],
            ],
        ]);

        $response->assertCreated();
        $this->assertTrue($frozenNow->clone()->addHours(48)->equalTo($response->json('promised_at')));
    }

    public function test_an_explicitly_provided_promised_at_is_not_overridden(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['estimated_duration_hours' => 48]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $chosenDate = now()->addDays(3)->startOfSecond();

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'promised_at' => $chosenDate->toISOString(),
            'items' => [
                ['service_id' => $service->id, 'quantity' => 1],
            ],
        ]);

        $response->assertCreated();
        $this->assertTrue($chosenDate->equalTo($response->json('promised_at')));
    }

    public function test_a_weight_billed_item_is_priced_from_the_matching_tier(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['billing_mode' => 'kg', 'base_price' => null]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $service->priceTiers()->createMany([
            ['weight_min' => 0, 'weight_max' => 3, 'price_per_kg' => 1500],
            ['weight_min' => 3.01, 'weight_max' => null, 'price_per_kg' => 1200],
        ]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 1, 'weight_kg' => 4.8],
            ],
        ]);

        $response->assertCreated();
        // 4,8 kg tombe dans la tranche > 3,01 kg : 4,8 * 1200 = 5760
        $this->assertSame(5760, $response->json('total_amount'));
        $this->assertSame(1, $response->json('items.0.quantity'));
        $this->assertEquals(4.8, $response->json('items.0.weight_kg'));
    }

    public function test_round_to_hundred_rounds_the_weight_billed_line_total(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['billing_mode' => 'kg', 'base_price' => null, 'round_to_hundred' => true]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $service->priceTiers()->create(['weight_min' => 0, 'weight_max' => null, 'price_per_kg' => 1000]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 1, 'weight_kg' => 2.34],
            ],
        ]);

        $response->assertCreated();
        // 2,34 * 1000 = 2340, arrondi à la centaine -> 2300
        $this->assertSame(2300, $response->json('total_amount'));
    }

    public function test_a_weight_outside_every_tier_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['billing_mode' => 'kg', 'base_price' => null]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $service->priceTiers()->create(['weight_min' => 0, 'weight_max' => 3, 'price_per_kg' => 1500]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 1, 'weight_kg' => 10],
            ],
        ]);

        $response->assertStatus(422);
    }

    public function test_a_weight_cannot_be_submitted_for_a_piece_only_service(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['billing_mode' => 'piece', 'base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 1, 'weight_kg' => 2],
            ],
        ]);

        $response->assertStatus(422);
    }

    public function test_showing_an_order_includes_its_agency_for_the_printed_ticket(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create(['name' => 'Pressing Lomé Centre', 'address' => 'Boulevard du 13 janvier']);
        $accueil = $this->makeUser('accueil', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);

        $response = $this->actingAs($accueil)->getJson("/api/orders/{$order->id}");

        $response->assertOk();
        $response->assertJsonPath('agency.name', 'Pressing Lomé Centre');
        $response->assertJsonPath('agency.address', 'Boulevard du 13 janvier');
    }
}
