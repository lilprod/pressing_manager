<?php

namespace Tests\Feature\Clients;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyTier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/** Annuaire téléchargé par le comptoir pour retrouver un client hors ligne. */
class ClientOfflineDirectoryTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_it_lists_only_active_clients_of_the_counter_agency_with_their_tier(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Or', 'min_spend_amount' => 50000, 'discount_rate' => 0.1, 'is_active' => true]);
        Client::factory()->create(['agency_id' => $agency->id, 'first_name' => 'Awa', 'loyalty_spend_12m' => 60000]);
        Client::factory()->create(['agency_id' => $agency->id, 'first_name' => 'Inactif', 'is_active' => false]);
        Client::factory()->create(['agency_id' => $other->id, 'first_name' => 'Ailleurs']);

        $response = $this->actingAs($accueil)->getJson('/api/clients/offline-directory')->assertOk();

        $this->assertSame($agency->id, $response->json('agency_id'));
        $this->assertSame(['Awa'], collect($response->json('clients'))->pluck('first_name')->all());
        $this->assertSame('Or', $response->json('clients.0.loyalty_tier_name'));
        $this->assertEquals(0.1, $response->json('clients.0.loyalty_discount_rate'));
    }

    public function test_a_local_user_cannot_download_another_agency_directory(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        Client::factory()->create(['agency_id' => $other->id, 'first_name' => 'Ailleurs']);

        $response = $this->actingAs($accueil)->getJson("/api/clients/offline-directory?agency_id={$other->id}")->assertOk();

        // Agence non affectée : retombe sur l'agence de l'utilisateur, jamais l'autre.
        $this->assertSame($agency->id, $response->json('agency_id'));
        $this->assertSame([], $response->json('clients'));
    }

    public function test_a_global_user_must_choose_an_agency(): void
    {
        $this->seedRbac();
        Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->getJson('/api/clients/offline-directory')->assertStatus(422);
    }
}
