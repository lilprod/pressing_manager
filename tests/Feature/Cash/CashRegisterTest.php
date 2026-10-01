<?php

namespace Tests\Feature\Cash;

use App\Models\Agency;
use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Payment;
use Illuminate\Http\UploadedFile;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;

class CashRegisterTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private const CHECKLIST = [
        'journal_verified', 'cash_recounted', 'mobile_money_statements_checked',
        'card_payments_verified', 'anomalies_handled', 'double_control_done',
    ];

    public function test_an_accueil_can_record_a_manual_cash_movement(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'sortie',
            'category' => 'fourniture',
            'amount' => 5000,
            'reason' => 'Achat de sachets plastiques',
            'counterparty' => 'Fournisseur Togo Plastics',
            'reference' => 'BON-0042',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('type', 'sortie');
        $response->assertJsonPath('status', 'valide');
        $response->assertJsonPath('amount', 5000);
        // Régression : la relation `creator` (renommée depuis `createdBy` pour éviter la
        // collision avec la colonne `created_by`) ne doit pas écraser la FK brute en JSON.
        $response->assertJsonPath('created_by', $accueil->id);
        $response->assertJsonPath('creator.id', $accueil->id);
        $this->assertDatabaseHas('cash_movements', [
            'agency_id' => $agency->id,
            'type' => 'sortie',
            'category' => 'fourniture',
            'amount' => 5000,
            'counterparty' => 'Fournisseur Togo Plastics',
            'status' => 'valide',
            'created_by' => $accueil->id,
        ]);
    }

    public function test_a_movement_can_carry_a_proof_file(): void
    {
        Storage::fake(config('filesystems.default'));
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->post('/api/cash/movements', [
            'type' => 'sortie',
            'category' => 'fourniture',
            'amount' => 5000,
            'reason' => 'Achat de sachets plastiques',
            'proof' => UploadedFile::fake()->create('recu.pdf', 100, 'application/pdf'),
        ]);

        $response->assertCreated();
        $movementId = $response->json('id');
        $this->assertNotNull(CashMovement::find($movementId)->proof_path);

        $proof = $this->actingAs($accueil)->get("/api/cash/movements/{$movementId}/proof");
        $proof->assertOk();
    }

    public function test_recording_a_cash_movement_requires_the_payments_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/cash/movements', [
            'type' => 'entree',
            'category' => 'autre',
            'amount' => 1000,
            'reason' => 'Fonds de caisse',
        ]);

        $response->assertStatus(403);
    }

    public function test_a_sensitive_movement_above_threshold_stays_pending_and_excluded_from_the_balance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'entree',
            'category' => 'depot_banque',
            'amount' => 300000, // > seuil (250 000 par défaut)
            'reason' => 'Apport exceptionnel',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', 'en_attente');

        $summary = $this->actingAs($accueil)->getJson('/api/cash/summary');
        $summary->assertJsonPath('manual_in_total', 0);
    }

    public function test_validating_a_pending_movement_includes_it_in_the_balance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $manager = $this->makeUser('manager');

        $created = $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'entree',
            'category' => 'depot_banque',
            'amount' => 300000,
            'reason' => 'Apport exceptionnel',
        ])->json();

        $response = $this->actingAs($manager)->postJson("/api/cash/movements/{$created['id']}/validate");
        $response->assertOk();
        $response->assertJsonPath('status', 'valide');
        $response->assertJsonPath('validator.id', $manager->id);

        $summary = $this->actingAs($accueil)->getJson('/api/cash/summary');
        $summary->assertJsonPath('manual_in_total', 300000);
    }

    public function test_a_movement_already_validated_cannot_be_validated_again(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $created = $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'sortie', 'category' => 'autre', 'amount' => 1000, 'reason' => 'Divers',
        ])->json();

        $response = $this->actingAs($accueil)->postJson("/api/cash/movements/{$created['id']}/validate");
        $response->assertStatus(422);
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
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte',
            'amount' => 9000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'flooz',
            'amount' => 4000, 'status' => 'complete', 'paid_at' => now(),
        ]);

        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'entree', 'amount' => 10000,
            'reason' => 'Fonds de caisse initial', 'status' => 'valide', 'occurred_at' => now(),
        ]);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 2000,
            'reason' => 'Achat fournitures', 'status' => 'valide', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/summary');

        $response->assertOk();
        $response->assertJsonPath('opening_balance', 0);
        $response->assertJsonPath('cash_payments_total', 3000);
        $response->assertJsonPath('manual_in_total', 10000);
        $response->assertJsonPath('manual_out_total', 2000);
        // 0 + 3000 + 10000 - 2000
        $response->assertJsonPath('expected_balance', 11000);
        $response->assertJsonPath('by_method.espece.theoretical', 11000);
        $response->assertJsonPath('by_method.mobile_money.theoretical', 4000);
        $response->assertJsonPath('by_method.carte.theoretical', 9000);
    }

    public function test_closing_the_register_records_the_per_method_variance_and_becomes_the_next_opening_balance(): void
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
            'counts' => ['espece' => 4800, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
            'notes' => 'Écart espèces : 200 FCFA manquants, non expliqué.',
        ]);

        $firstClose->assertCreated();
        $firstClose->assertJsonPath('expected_balance', 5000);
        $firstClose->assertJsonPath('counted_balance', 4800);
        $firstClose->assertJsonPath('variance', -200);
        $this->assertCount(3, $firstClose->json('counts'));

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

    public function test_a_nonzero_variance_requires_a_justification(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 500, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ]);

        $response->assertStatus(422);
    }

    public function test_the_checklist_must_be_fully_completed(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => ['journal_verified'],
        ]);

        $response->assertStatus(422);
    }

    public function test_closing_is_blocked_while_a_movement_is_pending_validation(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'entree', 'category' => 'depot_banque', 'amount' => 300000, 'reason' => 'Apport',
        ])->assertCreated();

        $response = $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ]);

        $response->assertStatus(422);
    }

    public function test_the_register_cannot_be_closed_twice_for_the_same_business_date(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ])->assertCreated();

        $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ])->assertStatus(409);
    }

    public function test_a_closure_pdf_report_is_generated_and_downloadable(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $created = $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ])->json();

        $response = $this->actingAs($accueil)->get("/api/cash/closures/{$created['id']}/pdf");

        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', $response->streamedContent());
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
