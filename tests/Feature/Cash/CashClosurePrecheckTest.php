<?php

namespace Tests\Feature\Cash;

use App\Models\Agency;
use App\Models\Attendance;
use App\Models\CashClosure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class CashClosurePrecheckTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private const CHECKLIST = [
        'journal_verified', 'cash_recounted', 'mobile_money_statements_checked',
        'card_payments_verified', 'anomalies_handled', 'double_control_done',
    ];

    public function test_precheck_reports_no_pending_movement_and_no_prior_closure_by_default(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/cash/closures/precheck');

        $response->assertOk();
        $response->assertJsonPath('pending_movements_count', 0);
        $response->assertJsonPath('already_closed', false);
        $response->assertJsonPath('last_closure', null);
    }

    public function test_precheck_matches_the_real_lock_used_by_the_closure_itself(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        // Un mouvement sensible en attente doit apparaître ici ET bloquer closeRegister()
        // avec exactement la même condition (pas une estimation séparée).
        $this->actingAs($accueil)->postJson('/api/cash/movements', [
            'type' => 'entree', 'category' => 'depot_banque', 'amount' => 300000, 'reason' => 'Apport',
        ])->assertCreated();

        $precheck = $this->actingAs($accueil)->getJson('/api/cash/closures/precheck');
        $precheck->assertJsonPath('pending_movements_count', 1);

        $closeAttempt = $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ]);
        $closeAttempt->assertStatus(422);
    }

    public function test_precheck_already_closed_matches_the_real_unique_constraint(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ])->assertCreated();

        $precheck = $this->actingAs($accueil)->getJson('/api/cash/closures/precheck?business_date='.now()->toDateString());
        $precheck->assertJsonPath('already_closed', true);
        $precheck->assertJsonPath('last_closure.business_date', now()->toDateString());

        $this->actingAs($accueil)->postJson('/api/cash/closures', [
            'business_date' => now()->toDateString(),
            'counts' => ['espece' => 0, 'mobile_money' => 0, 'carte' => 0],
            'checklist' => self::CHECKLIST,
        ])->assertStatus(409);
    }

    public function test_operators_status_is_verified_once_clocked_out_and_pending_while_still_present(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $stillPresent = $this->makeUser('accueil', $agency);
        $clockedOut = $this->makeUser('technicien', $agency);

        Attendance::create([
            'agency_id' => $agency->id, 'user_id' => $stillPresent->id,
            'clock_in' => now()->startOfDay()->addHours(8), 'clock_out' => null, 'status' => 'present',
        ]);
        Attendance::create([
            'agency_id' => $agency->id, 'user_id' => $clockedOut->id,
            'clock_in' => now()->startOfDay()->addHours(7), 'clock_out' => now()->startOfDay()->addHours(16),
            'status' => 'present',
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/closures/operators');

        $response->assertOk();
        $operators = collect($response->json('operators'))->keyBy(fn ($o) => $o['user']['id']);
        $this->assertSame('en_attente', $operators[$stillPresent->id]['status']);
        $this->assertSame('verifie', $operators[$clockedOut->id]['status']);
    }

    public function test_a_local_user_cannot_precheck_another_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        CashClosure::create([
            'agency_id' => $agencyB->id, 'business_date' => now()->toDateString(),
            'opening_balance' => 0, 'cash_payments_total' => 0, 'manual_in_total' => 0,
            'manual_out_total' => 0, 'expected_balance' => 0, 'counted_balance' => 0,
            'variance' => 0, 'closed_at' => now(),
        ]);

        // Le paramètre agency_id est ignoré pour un utilisateur local (résolu sur SA
        // propre agence) : aucune donnée de l'agence B ne doit apparaître.
        $response = $this->actingAs($accueilA)->getJson("/api/cash/closures/precheck?agency_id={$agencyB->id}");

        $response->assertOk();
        $response->assertJsonPath('already_closed', false);
    }
}
