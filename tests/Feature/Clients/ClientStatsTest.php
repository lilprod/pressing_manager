<?php

namespace Tests\Feature\Clients;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyTier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class ClientStatsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_it_reports_active_and_new_clients_this_month(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        Client::factory()->for($agency, 'agency')->create(['is_active' => true, 'created_at' => now()]);
        Client::factory()->for($agency, 'agency')->create(['is_active' => true, 'created_at' => now()->subMonths(2)]);
        Client::factory()->for($agency, 'agency')->create(['is_active' => false, 'created_at' => now()]);

        $response = $this->actingAs($accueil)->getJson('/api/clients/stats');

        $response->assertOk();
        $response->assertJsonPath('active_count', 2);
        $response->assertJsonPath('new_this_month', 2);
    }

    public function test_it_counts_vip_clients_at_the_highest_active_tier(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Argent', 'min_spend_amount' => 50000, 'discount_rate' => 0.05, 'is_active' => true]);
        LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Or', 'min_spend_amount' => 150000, 'discount_rate' => 0.10, 'is_active' => true]);
        LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Platine (inactif)', 'min_spend_amount' => 500000, 'discount_rate' => 0.20, 'is_active' => false]);

        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 200, 'loyalty_spend_12m' => 200000]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 80, 'loyalty_spend_12m' => 80000]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 600, 'loyalty_spend_12m' => 600000]);

        $response = $this->actingAs($accueil)->getJson('/api/clients/stats');

        $response->assertOk();
        // Le palier « Platine » est inactif : le plus haut palier actif est « Or » (150 000 FCFA
        // de dépenses sur 12 mois), donc les clients à 200 000 et 600 000 sont VIP, celui à
        // 80 000 ne l'est pas.
        $response->assertJsonPath('vip_count', 2);
        $response->assertJsonPath('points_issued', 880);
    }

    public function test_vip_count_is_zero_when_no_loyalty_tier_is_active(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 1000]);

        $response = $this->actingAs($accueil)->getJson('/api/clients/stats');

        $response->assertOk();
        $response->assertJsonPath('vip_count', 0);
    }

    public function test_stats_are_scoped_to_the_requested_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        Client::factory()->for($agencyA, 'agency')->create(['is_active' => true]);
        Client::factory()->for($agencyB, 'agency')->create(['is_active' => true]);
        Client::factory()->for($agencyB, 'agency')->create(['is_active' => true]);

        $response = $this->actingAs($admin)->getJson("/api/clients/stats?agency_id={$agencyB->id}");

        $response->assertOk();
        $response->assertJsonPath('active_count', 2);
    }
}
