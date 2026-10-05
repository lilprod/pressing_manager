<?php

namespace Tests\Feature\Cash;

use App\Models\Agency;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class CashLedgerTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function seedThreeKinds(Agency $agency): array
    {
        $client = Client::factory()->for($agency, 'agency')->create();

        $payment = Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte',
            'amount' => 9000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        $movement = CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'fourniture',
            'amount' => 1500, 'reason' => 'Sacs plastiques', 'status' => 'valide', 'occurred_at' => now(),
        ]);
        $closure = CashClosure::create([
            'agency_id' => $agency->id, 'business_date' => now()->toDateString(),
            'opening_balance' => 0, 'cash_payments_total' => 0, 'manual_in_total' => 0,
            'manual_out_total' => 0, 'expected_balance' => 0, 'counted_balance' => 0,
            'variance' => 0, 'closed_at' => now(),
        ]);

        return compact('payment', 'movement', 'closure');
    }

    public function test_the_ledger_combines_movements_payments_and_closures(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $this->seedThreeKinds($agency);

        $response = $this->actingAs($accueil)->getJson('/api/cash/ledger');

        $response->assertOk();
        $kinds = collect($response->json('data'))->pluck('kind')->sort()->values()->all();
        $this->assertSame(['cloture', 'encaissement', 'mouvement'], $kinds);
    }

    public function test_the_ledger_can_be_filtered_by_type(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $this->seedThreeKinds($agency);

        $response = $this->actingAs($accueil)->getJson('/api/cash/ledger?type=encaissement');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $response->assertJsonPath('data.0.kind', 'encaissement');
    }

    public function test_the_ledger_can_be_filtered_by_status(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $this->seedThreeKinds($agency);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'entree', 'category' => 'depot_banque',
            'amount' => 300000, 'reason' => 'Apport', 'status' => 'en_attente', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/ledger?status=en_attente');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $response->assertJsonPath('data.0.status', 'en_attente');
    }

    public function test_the_ledger_can_be_filtered_by_payment_method(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $this->seedThreeKinds($agency);

        $response = $this->actingAs($accueil)->getJson('/api/cash/ledger?method=carte');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $response->assertJsonPath('data.0.kind', 'encaissement');
        $response->assertJsonPath('data.0.method', 'carte');
    }

    public function test_the_ledger_search_matches_reference_category_or_agent(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'fourniture',
            'reference' => 'BON-UNIQUE-42', 'amount' => 1500, 'reason' => 'Divers',
            'status' => 'valide', 'occurred_at' => now(),
        ]);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'salaire',
            'amount' => 2000, 'reason' => 'Autre', 'status' => 'valide', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/ledger?search=BON-UNIQUE');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $response->assertJsonPath('data.0.reference', 'BON-UNIQUE-42');
    }

    public function test_the_ledger_never_leaks_another_agencys_operations(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $this->seedThreeKinds($agencyB);

        $response = $this->actingAs($accueilA)->getJson('/api/cash/ledger');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    public function test_exporting_the_ledger_requires_a_from_and_to_date(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->getJson('/api/cash/ledger/export/pdf')->assertStatus(422);
        $this->actingAs($accueil)->getJson('/api/cash/ledger/export/excel')->assertStatus(422);
    }

    public function test_exporting_the_ledger_as_pdf_returns_a_pdf_document(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $this->seedThreeKinds($agency);

        $response = $this->actingAs($accueil)->get(
            '/api/cash/ledger/export/pdf?from='.now()->subDay()->toDateString().'&to='.now()->toDateString()
        );

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }

    public function test_exporting_the_ledger_as_excel_returns_a_spreadsheet(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $this->seedThreeKinds($agency);

        $response = $this->actingAs($accueil)->get(
            '/api/cash/ledger/export/excel?from='.now()->subDay()->toDateString().'&to='.now()->toDateString()
        );

        $response->assertOk();
        $this->assertSame(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            $response->headers->get('Content-Type')
        );
    }
}
