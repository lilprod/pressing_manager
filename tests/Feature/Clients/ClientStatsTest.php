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

        LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Argent', 'min_points' => 50, 'discount_rate' => 0.05, 'is_active' => true]);
        LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Or', 'min_points' => 150, 'discount_rate' => 0.10, 'is_active' => true]);
        LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Platine (inactif)', 'min_points' => 500, 'discount_rate' => 0.20, 'is_active' => false]);

        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 200]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 80]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 600]);

        $response = $this->actingAs($accueil)->getJson('/api/clients/stats');

        $response->assertOk();
        // Le palier « Platine » est inactif : le plus haut palier actif est « Or » (150 pts),
        // donc les clients à 200 et 600 points sont VIP, celui à 80 points ne l'est pas.
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
