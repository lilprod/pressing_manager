<?php

namespace Tests\Feature\Promotions;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Promotion;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md) : câblage réel d'un code promo dans
 * `OrderController::store` — validation serveur (jamais le montant calculé côté
 * client), quotas, éligibilité, cumul avec la remise fidélité.
 */
class PromotionApplicationTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeOrderPayload(Agency $agency, Client $client, Service $service, array $overrides = []): array
    {
        return array_merge([
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
        ], $overrides);
    }

    public function test_a_valid_percentage_code_discounts_the_order_and_records_usage(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $promotion = Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'PROMO10',
            'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
        ]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'promo10', // insensible à la casse
        ]));

        $response->assertCreated();
        $response->assertJsonPath('total_amount', 10000);
        $response->assertJsonPath('discount_amount', 1000);
        $response->assertJsonPath('promotion_discount_amount', 1000);
        $response->assertJsonPath('promotion_id', $promotion->id);
        $this->assertDatabaseHas('promotion_usages', ['promotion_id' => $promotion->id, 'discount_amount' => 1000]);
    }

    public function test_an_unknown_code_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'INCONNU',
        ]));

        $response->assertStatus(422);
    }

    public function test_an_expired_code_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'PERIME',
            'is_active' => true, 'starts_at' => now()->subMonths(2), 'ends_at' => now()->subMonth(),
        ]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'PERIME',
        ]));

        $response->assertStatus(422);
    }

    public function test_a_code_exceeding_its_global_quota_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $promotion = Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'LIMITE1',
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
            'quota_total' => 1,
        ]);

        $firstClient = Client::factory()->for($agency, 'agency')->create();
        $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $firstClient, $service, [
            'promotion_code' => 'LIMITE1',
        ]))->assertCreated();

        $secondClient = Client::factory()->for($agency, 'agency')->create();
        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $secondClient, $service, [
            'promotion_code' => 'LIMITE1',
        ]));

        $response->assertStatus(422);
    }

    public function test_a_client_cannot_exceed_the_per_client_quota(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'UNEFOIS',
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
            'quota_per_client' => 1,
        ]);

        $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'UNEFOIS',
        ]))->assertCreated();

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'UNEFOIS',
        ]));

        $response->assertStatus(422);
    }

    public function test_the_minimum_order_amount_is_enforced(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 5000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'MIN10K',
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
            'minimum_order_amount' => 10000,
        ]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'MIN10K',
        ]));

        $response->assertStatus(422);
    }

    public function test_a_code_scoped_to_another_agency_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $otherAgency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $promotion = Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'AUTREAGENCE',
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
        ]);
        $promotion->agencies()->sync([$otherAgency->id]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'AUTREAGENCE',
        ]));

        $response->assertStatus(422);
    }

    public function test_a_non_combinable_promotion_suppresses_the_auto_loyalty_discount(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'EXCLUSIF',
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
            'discount_type' => 'fixed', 'discount_value' => 1000, 'combinable_with_loyalty' => false,
        ]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'EXCLUSIF',
            'discount_amount' => 500, // remise fidélité auto-calculée côté client
            'discount_is_loyalty_auto' => true,
        ]));

        $response->assertCreated();
        $response->assertJsonPath('loyalty_discount_amount', 0);
        $response->assertJsonPath('promotion_discount_amount', 1000);
        $response->assertJsonPath('discount_amount', 1000);
    }

    public function test_a_combinable_promotion_adds_up_with_the_loyalty_discount(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'CUMUL',
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
            'discount_type' => 'fixed', 'discount_value' => 1000, 'combinable_with_loyalty' => true,
        ]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', $this->makeOrderPayload($agency, $client, $service, [
            'promotion_code' => 'CUMUL',
            'discount_amount' => 500,
            'discount_is_loyalty_auto' => true,
        ]));

        $response->assertCreated();
        $response->assertJsonPath('loyalty_discount_amount', 500);
        $response->assertJsonPath('promotion_discount_amount', 1000);
        $response->assertJsonPath('discount_amount', 1500);
    }
}
