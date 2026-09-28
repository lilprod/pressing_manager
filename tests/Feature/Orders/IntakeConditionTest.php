<?php

namespace Tests\Feature\Orders;

use App\Models\Agency;
use App\Models\Client;
use App\Models\IntakeCondition;
use App\Models\Order;
use App\Models\Service;
use Database\Seeders\IntakeConditionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class IntakeConditionTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_the_catalog_lists_active_intake_conditions(): void
    {
        $this->seedRbac();
        $this->seed(IntakeConditionSeeder::class);
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/intake-conditions');

        $response->assertOk();
        $this->assertCount(count(IntakeConditionSeeder::CONDITIONS), $response->json());
    }

    public function test_the_catalog_excludes_inactive_conditions(): void
    {
        $this->seedRbac();
        IntakeCondition::create(['code' => 'active_one', 'label' => 'Actif', 'is_active' => true]);
        IntakeCondition::create(['code' => 'inactive_one', 'label' => 'Inactif', 'is_active' => false]);
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/intake-conditions');

        $response->assertOk();
        $this->assertCount(1, $response->json());
        $this->assertSame('active_one', $response->json('0.code'));
    }

    public function test_creating_an_order_records_intake_conditions_and_notes_per_item(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $tache = IntakeCondition::create(['code' => 'tache', 'label' => 'Taché']);
        $dechirure = IntakeCondition::create(['code' => 'dechirure', 'label' => 'Déchiré']);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                [
                    'service_id' => $service->id,
                    'quantity' => 1,
                    'intake_condition_ids' => [$tache->id, $dechirure->id],
                    'intake_notes' => 'Manche gauche effilochée',
                ],
            ],
        ]);

        $response->assertCreated();
        $itemId = $response->json('items.0.id');
        $this->assertSame('Manche gauche effilochée', $response->json('items.0.intake_notes'));
        $conditionIds = collect($response->json('items.0.intake_conditions'))->pluck('id');
        $this->assertEqualsCanonicalizing([$tache->id, $dechirure->id], $conditionIds->all());

        $this->assertDatabaseHas('order_item_intake_condition', ['order_item_id' => $itemId, 'intake_condition_id' => $tache->id]);
        $this->assertDatabaseHas('order_item_intake_condition', ['order_item_id' => $itemId, 'intake_condition_id' => $dechirure->id]);
    }

    public function test_creating_an_order_without_intake_conditions_still_works(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
        ]);

        $response->assertCreated();
        $this->assertSame([], $response->json('items.0.intake_conditions'));
        $this->assertNull($response->json('items.0.intake_notes'));
    }

    public function test_an_unknown_intake_condition_id_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 1, 'intake_condition_ids' => [999999]],
            ],
        ]);

        $response->assertStatus(422);
    }

    public function test_showing_an_order_includes_intake_conditions(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true]);
        $tache = IntakeCondition::create(['code' => 'tache', 'label' => 'Taché']);

        $created = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'intake_condition_ids' => [$tache->id]]],
        ])->json();

        $response = $this->actingAs($accueil)->getJson("/api/orders/{$created['id']}");

        $response->assertOk();
        $this->assertSame('Taché', $response->json('items.0.intake_conditions.0.label'));
    }
}
