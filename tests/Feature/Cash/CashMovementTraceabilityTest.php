<?php

namespace Tests\Feature\Cash;

use App\Models\Agency;
use App\Models\CashMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class CashMovementTraceabilityTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_showing_a_movement_returns_its_creator_and_validator(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $manager = $this->makeUser('manager');

        $created = $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'entree', 'category' => 'depot_banque', 'amount' => 300000, 'reason' => 'Apport',
        ])->json();
        $this->actingAs($manager)->postJson("/api/cash/movements/{$created['id']}/validate")->assertOk();

        $response = $this->actingAs($accueil)->getJson("/api/cash/movements/{$created['id']}");

        $response->assertOk();
        $response->assertJsonPath('creator.id', $accueil->id);
        $response->assertJsonPath('validator.id', $manager->id);
        $response->assertJsonPath('status', 'valide');
    }

    public function test_a_local_user_cannot_view_another_agencys_movement(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $movement = CashMovement::create([
            'agency_id' => $agencyB->id, 'type' => 'sortie', 'category' => 'autre',
            'amount' => 1000, 'reason' => 'Divers', 'status' => 'valide', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueilA)->getJson("/api/cash/movements/{$movement->id}");

        $response->assertStatus(403);
    }

    public function test_eligible_validators_lists_only_real_users_with_the_payments_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency); // a payments.manage
        $technicien = $this->makeUser('technicien', $agency); // n'a PAS payments.manage

        $response = $this->actingAs($accueil)->getJson('/api/cash/movements/eligible-validators');

        $response->assertOk();
        $ids = collect($response->json('validators'))->pluck('id')->all();
        $this->assertContains($accueil->id, $ids);
        $this->assertNotContains($technicien->id, $ids);
        $this->assertSame(count($ids), $response->json('count'));
        // Jamais figé à 2 comme le suggère la maquette : le nombre réel dépend du personnel.
        $this->assertNotSame(2, $response->json('count'));
    }

    public function test_eligible_validators_excludes_inactive_users(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $inactive = $this->makeUser('accueil', $agency);
        $inactive->update(['is_active' => false]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/movements/eligible-validators');

        $response->assertOk();
        $ids = collect($response->json('validators'))->pluck('id')->all();
        $this->assertNotContains($inactive->id, $ids);
    }
}
