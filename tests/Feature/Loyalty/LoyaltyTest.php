<?php

namespace Tests\Feature\Loyalty;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyTier;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class LoyaltyTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_a_cash_payment_credits_loyalty_points_to_the_client(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 0]);

        $response = $this->actingAs($accueil)->postJson('/api/payments/cash', [
            'client_id' => $client->id,
            'amount' => 1250, // 100 FCFA / point => 12 points
        ]);

        $response->assertCreated();
        $this->assertSame(12, $client->refresh()->loyalty_points);
    }

    public function test_replaying_the_same_webhook_does_not_double_credit_points(): void
    {
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 0]);

        Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'flooz',
            'amount' => 5000, // 50 points
            'currency' => 'XOF',
            'status' => 'en_attente',
            'external_reference' => 'flooz-ref-loyalty',
        ]);

        $payload = ['reference' => 'flooz-ref-loyalty', 'status' => 'success'];

        $this->postJson('/api/webhooks/payments/flooz', $payload)->assertOk();
        $this->postJson('/api/webhooks/payments/flooz', $payload)->assertOk();

        $this->assertSame(50, $client->refresh()->loyalty_points);
    }

    public function test_a_client_resolves_the_highest_tier_reached_by_its_points(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05]);
        LoyaltyTier::factory()->create(['name' => 'Or', 'min_points' => 150, 'discount_rate' => 0.10]);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 80]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('loyalty_tier_name', 'Argent');
        $response->assertJsonPath('loyalty_discount_rate', 0.05);
    }

    public function test_a_client_below_every_tier_has_no_discount(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05]);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 10]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('loyalty_tier_name', null);
        $response->assertJsonPath('loyalty_discount_rate', 0);
    }

    public function test_an_inactive_tier_is_ignored_when_resolving_the_discount(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['name' => 'Retiré', 'min_points' => 50, 'discount_rate' => 0.05, 'is_active' => false]);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 80]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('loyalty_discount_rate', 0);
    }

    public function test_an_admin_can_create_and_update_a_loyalty_tier(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/loyalty-tiers', [
            'name' => 'Bronze',
            'min_points' => 20,
            'discount_rate' => 0.02,
        ]);
        $created->assertCreated();

        $updated = $this->actingAs($admin)->patchJson("/api/loyalty-tiers/{$created->json('id')}", [
            'discount_rate' => 0.03,
        ]);
        $updated->assertOk();
        $updated->assertJsonPath('discount_rate', 0.03);
    }

    public function test_creating_a_loyalty_tier_requires_the_clients_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/loyalty-tiers', [
            'name' => 'Bronze',
            'min_points' => 20,
            'discount_rate' => 0.02,
        ]);

        $response->assertStatus(403);
    }

    public function test_two_tiers_cannot_share_the_same_min_points_threshold(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        LoyaltyTier::factory()->create(['min_points' => 50]);

        $response = $this->actingAs($admin)->postJson('/api/loyalty-tiers', [
            'name' => 'Doublon',
            'min_points' => 50,
            'discount_rate' => 0.05,
        ]);

        $response->assertStatus(422);
    }
}
