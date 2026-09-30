<?php

namespace Tests\Feature\Cash;

use App\Models\Agency;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Payment;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class CashRegisterTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_accueil_can_record_a_manual_cash_movement(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'sortie',
            'amount' => 5000,
            'reason' => 'Achat de sachets plastiques',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('type', 'sortie');
        $response->assertJsonPath('amount', 5000);
        // Régression : la relation `creator` (renommée depuis `createdBy` pour éviter la
        // collision avec la colonne `created_by`) ne doit pas écraser la FK brute en JSON.
        $response->assertJsonPath('created_by', $accueil->id);
        $response->assertJsonPath('creator.id', $accueil->id);
        $this->assertDatabaseHas('cash_movements', [
            'agency_id' => $agency->id,
            'type' => 'sortie',
            'amount' => 5000,
            'created_by' => $accueil->id,
        ]);
    }

    public function test_recording_a_cash_movement_requires_the_payments_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/cash/movements', [
            'type' => 'entree',
            'amount' => 1000,
            'reason' => 'Fonds de caisse',
        ]);

        $response->assertStatus(403);
    }

    public function test_the_balance_summary_combines_cash_payments_and_manual_movements(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 3000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        // Un paiement carte ne doit pas compter dans le solde espèces.
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte',
            'amount' => 9000, 'status' => 'complete', 'paid_at' => now(),
        ]);

        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'entree', 'amount' => 10000,
            'reason' => 'Fonds de caisse initial', 'occurred_at' => now(),
        ]);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 2000,
            'reason' => 'Achat fournitures', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/summary');

        $response->assertOk();
        $response->assertJsonPath('opening_balance', 0);
        $response->assertJsonPath('cash_payments_total', 3000);
        $response->assertJsonPath('manual_in_total', 10000);
        $response->assertJsonPath('manual_out_total', 2000);
        // 0 + 3000 + 10000 - 2000
        $response->assertJsonPath('expected_balance', 11000);
    }

    public function test_closing_the_register_records_the_variance_and_becomes_the_next_opening_balance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 5000, 'status' => 'complete', 'paid_at' => now(),
        ]);

        $firstClose = $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counted_balance' => 4800,
        ]);

        $firstClose->assertCreated();
        $firstClose->assertJsonPath('expected_balance', 5000);
        $firstClose->assertJsonPath('counted_balance', 4800);
        $firstClose->assertJsonPath('variance', -200);

        // La clôture suivante doit repartir du compté précédent (4800), pas de 0.
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 1000, 'status' => 'complete', 'paid_at' => now()->addMinute(),
        ]);

        $summary = $this->actingAs($accueil)->getJson('/api/cash/summary');
        $summary->assertOk();
        $summary->assertJsonPath('opening_balance', 4800);
        $summary->assertJsonPath('cash_payments_total', 1000);
        $summary->assertJsonPath('expected_balance', 5800);
    }

    public function test_the_register_cannot_be_closed_twice_for_the_same_business_date(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counted_balance' => 0,
        ])->assertCreated();

        $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counted_balance' => 0,
        ])->assertStatus(409);
    }

    public function test_a_local_user_cannot_view_another_agencys_closure(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $closure = CashClosure::create([
            'agency_id' => $agencyB->id, 'business_date' => now()->toDateString(),
            'opening_balance' => 0, 'cash_payments_total' => 0, 'manual_in_total' => 0,
            'manual_out_total' => 0, 'expected_balance' => 0, 'counted_balance' => 0,
            'variance' => 0, 'closed_at' => now(),
        ]);

        $response = $this->actingAs($accueilA)->getJson("/api/cash/closures/{$closure->id}");

        $response->assertStatus(403);
    }
}
