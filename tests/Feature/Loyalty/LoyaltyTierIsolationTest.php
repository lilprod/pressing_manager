<?php

namespace Tests\Feature\Loyalty;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyTier;
use App\Models\Pressing;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Chantier D.1 (audit de conformité superadmin, voir CLAUDE.md « Chantier D.1 ») :
 * `loyalty_tiers` avait été oublié lors du pivot multi-tenant du 2026-10-02 — tous
 * les pressings du déploiement partageaient les mêmes paliers de fidélité. Même
 * patron que `CrossPressingIsolationTest` : deux pressings A/B, chacun avec son
 * propre manager et ses propres paliers.
 */
class LoyaltyTierIsolationTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private Pressing $pressingA;

    private Pressing $pressingB;

    private User $managerA;

    private User $managerB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedRbac();

        $this->pressingA = Pressing::factory()->create(['code' => 'TENANT-A']);
        $this->pressingB = Pressing::factory()->create(['code' => 'TENANT-B']);

        $adminRoleId = Role::where('slug', 'admin')->value('id');

        $this->managerA = User::factory()->create([
            'pressing_id' => $this->pressingA->id,
            'agency_id' => null,
            'role_id' => $adminRoleId,
        ]);
        $this->managerB = User::factory()->create([
            'pressing_id' => $this->pressingB->id,
            'agency_id' => null,
            'role_id' => $adminRoleId,
        ]);
    }

    public function test_a_tier_created_in_one_pressing_is_invisible_in_another(): void
    {
        LoyaltyTier::factory()->create(['pressing_id' => $this->pressingA->id, 'name' => 'Argent A', 'min_points' => 50]);
        LoyaltyTier::factory()->create(['pressing_id' => $this->pressingB->id, 'name' => 'Argent B', 'min_points' => 50]);

        $responseA = $this->actingAs($this->managerA)->getJson('/api/loyalty-tiers');
        $responseB = $this->actingAs($this->managerB)->getJson('/api/loyalty-tiers');

        $responseA->assertOk();
        $responseA->assertJsonCount(1);
        $responseA->assertJsonPath('0.name', 'Argent A');

        $responseB->assertOk();
        $responseB->assertJsonCount(1);
        $responseB->assertJsonPath('0.name', 'Argent B');
    }

    public function test_two_pressings_can_each_use_the_same_min_points_threshold(): void
    {
        LoyaltyTier::factory()->create(['pressing_id' => $this->pressingA->id, 'min_points' => 50]);

        // Même seuil, pressing différent — l'unicité est désormais composite
        // (pressing_id, min_points), pas globale.
        $response = $this->actingAs($this->managerB)->postJson('/api/loyalty-tiers', [
            'name' => 'Argent B',
            'min_points' => 50,
            'discount_rate' => 0.05,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('loyalty_tiers', [
            'pressing_id' => $this->pressingB->id,
            'min_points' => 50,
        ]);
    }

    public function test_a_manager_cannot_update_a_loyalty_tier_from_another_pressing(): void
    {
        $tier = LoyaltyTier::factory()->create(['pressing_id' => $this->pressingA->id, 'min_points' => 50]);

        $response = $this->actingAs($this->managerB)->patchJson("/api/loyalty-tiers/{$tier->id}", [
            'discount_rate' => 0.9,
        ]);

        $response->assertStatus(403);
        $this->assertNotEquals(0.9, $tier->refresh()->discount_rate);
    }

    public function test_a_client_only_resolves_a_tier_from_its_own_pressing(): void
    {
        $agencyA = Agency::factory()->create(['pressing_id' => $this->pressingA->id]);
        $agencyB = Agency::factory()->create(['pressing_id' => $this->pressingB->id]);

        // Pressing A a un palier à 50 points ; pressing B n'en a aucun.
        LoyaltyTier::factory()->create(['pressing_id' => $this->pressingA->id, 'name' => 'Argent A', 'min_points' => 50, 'discount_rate' => 0.05]);

        $clientA = Client::factory()->for($agencyA, 'agency')->create(['loyalty_points' => 80]);
        $clientB = Client::factory()->for($agencyB, 'agency')->create(['loyalty_points' => 80]);

        $responseA = $this->actingAs($this->managerA)->getJson("/api/clients/{$clientA->id}");
        $responseB = $this->actingAs($this->managerB)->getJson("/api/clients/{$clientB->id}");

        $responseA->assertOk();
        $responseA->assertJsonPath('loyalty_tier_name', 'Argent A');

        $responseB->assertOk();
        // Même nombre de points, mais le palier appartient à l'autre pressing —
        // ne doit jamais être atteint depuis le pressing B.
        $responseB->assertJsonPath('loyalty_tier_name', null);
        $responseB->assertJsonPath('loyalty_discount_rate', 0);
    }

    public function test_vip_client_stats_never_leak_a_tier_from_another_pressing(): void
    {
        $agencyB = Agency::factory()->create(['pressing_id' => $this->pressingB->id]);

        // Pressing A a un palier VIP à 50 points ; pressing B n'a AUCUN palier.
        // Si ClientController::stats() lisait le mauvais pressing, un client de B
        // à 80 points serait compté VIP via le seuil de A alors qu'il ne devrait
        // jamais l'être (B n'a pas de programme de fidélité configuré).
        LoyaltyTier::factory()->create(['pressing_id' => $this->pressingA->id, 'min_points' => 50]);

        Client::factory()->for($agencyB, 'agency')->create(['loyalty_points' => 80, 'is_active' => true]);

        $response = $this->actingAs($this->managerB)->getJson('/api/clients/stats');

        $response->assertOk();
        $response->assertJsonPath('vip_count', 0);
    }
}
