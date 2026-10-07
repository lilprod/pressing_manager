<?php

namespace Tests\Feature\Loyalty;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyPointMovement;
use App\Models\LoyaltyTier;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md) : trois endpoints ajoutés pour
 * l'écran `/loyalty` qui n'exposait jusqu'ici que les paliers eux-mêmes.
 */
class LoyaltyStatsEndpointTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_stats_reports_active_members_and_points_from_the_ledger(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Argent', 'min_spend_amount' => 50000, 'discount_rate' => 0.05]);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 80000, 'is_active' => true]);

        LoyaltyPointMovement::create(['client_id' => $client->id, 'agency_id' => $agency->id, 'points' => 100, 'reason' => 'payment', 'created_at' => now()]);
        LoyaltyPointMovement::create(['client_id' => $client->id, 'agency_id' => $agency->id, 'points' => -20, 'reason' => 'expired', 'created_at' => now()]);

        Order::factory()->for($agency, 'agency')->for($client, 'client')->create(['loyalty_discount_amount' => 1500, 'created_at' => now()]);

        $response = $this->actingAs($accueil)->getJson('/api/loyalty/stats?' . http_build_query(['from' => now()->subDay()->toDateString(), 'to' => now()->toDateString()]));

        $response->assertOk();
        $response->assertJsonPath('members_active', 1);
        $response->assertJsonPath('points_issued', 100);
        $response->assertJsonPath('points_expired', 20);
        $response->assertJsonPath('discounts_granted', 1500);
    }

    public function test_movements_lists_the_most_recent_entries_with_client_name(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['first_name' => 'Aminata', 'last_name' => 'Koné']);

        LoyaltyPointMovement::create(['client_id' => $client->id, 'agency_id' => $agency->id, 'points' => 460, 'reason' => 'payment', 'created_at' => now()]);

        $response = $this->actingAs($accueil)->getJson('/api/loyalty/movements');

        $response->assertOk();
        $response->assertJsonPath('0.client_name', 'Aminata Koné');
        $response->assertJsonPath('0.points', 460);
        $response->assertJsonPath('0.reason', 'payment');
    }

    public function test_segments_reports_new_members_and_top_tier_members(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Argent', 'min_spend_amount' => 50000, 'discount_rate' => 0.05]);
        LoyaltyTier::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Or', 'min_spend_amount' => 150000, 'discount_rate' => 0.10]);

        Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 200000, 'is_active' => true, 'created_at' => now()->subYear()]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 0, 'is_active' => true, 'created_at' => now()]);

        $response = $this->actingAs($accueil)->getJson('/api/loyalty/segments');

        $response->assertOk();
        $response->assertJsonPath('top_tier_members', 1);
        $response->assertJsonPath('new_members_30d', 1);
    }

    public function test_loyalty_stats_requires_the_clients_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $this->actingAs($technicien)->getJson('/api/loyalty/stats')->assertStatus(403);
    }
}
