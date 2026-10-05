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

class CashDashboardStatsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_stats_computes_todays_revenue_expenses_and_outstanding(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        // Paiement d'aujourd'hui (compté) et paiement d'hier (hors période du jour).
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 4000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte',
            'amount' => 9000, 'status' => 'complete', 'paid_at' => now()->subDay(),
        ]);

        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 1500,
            'reason' => 'Fournitures', 'status' => 'valide', 'occurred_at' => now(),
        ]);
        // Sortie en attente de validation : ne doit PAS compter dans "dépenses du jour".
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 300000,
            'reason' => 'Apport', 'status' => 'en_attente', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/stats');

        $response->assertOk();
        $response->assertJsonPath('revenue_today', 4000);
        $response->assertJsonPath('expenses_today', 1500);
        $response->assertJsonPath('last_closure', null);
    }

    public function test_stats_reports_the_real_last_closure_variance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $closure = CashClosure::create([
            'agency_id' => $agency->id, 'business_date' => now()->subDay()->toDateString(),
            'opening_balance' => 0, 'cash_payments_total' => 0, 'manual_in_total' => 0,
            'manual_out_total' => 0, 'expected_balance' => 5000, 'counted_balance' => 4800,
            'variance' => -200, 'closed_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/stats');

        $response->assertOk();
        $response->assertJsonPath('last_closure.id', $closure->id);
        $response->assertJsonPath('last_closure.variance', -200);
    }

    public function test_payment_breakdown_computes_percentages_per_method(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 5000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte',
            'amount' => 3000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'tmoney',
            'amount' => 2000, 'status' => 'complete', 'paid_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/payment-breakdown');

        $response->assertOk();
        $response->assertJsonPath('total', 10000);
        $response->assertJsonPath('by_method.espece.amount', 5000);
        $response->assertJsonPath('by_method.espece.percent', 50);
        $response->assertJsonPath('by_method.carte.amount', 3000);
        $response->assertJsonPath('by_method.mobile_money.amount', 2000);
        $response->assertJsonPath('by_method.mobile_money.percent', 20);
    }

    public function test_flow_series_fills_gaps_with_zero_over_fourteen_days(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 7000, 'status' => 'complete', 'paid_at' => now(),
        ]);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 1000,
            'reason' => 'Divers', 'status' => 'valide', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/cash/flow-series');

        $response->assertOk();
        $series = $response->json('series');
        $this->assertCount(14, $series);
        $today = $series[array_key_last($series)];
        $this->assertSame(7000, $today['in']);
        $this->assertSame(1000, $today['out']);
        $this->assertSame(6000, $today['net']);
        $response->assertJsonPath('in_total', 7000);
        $response->assertJsonPath('out_total', 1000);
    }

    public function test_stats_requires_the_payments_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $this->actingAs($technicien)->getJson('/api/cash/stats')->assertStatus(403);
    }

    public function test_a_local_users_agency_id_query_param_is_ignored_in_favor_of_their_own_agency(): void
    {
        // Un utilisateur local est toujours résolu sur SA propre agence (`$user->agency_id`),
        // jamais sur un `?agency_id=` fourni par le client — vérifie qu'un paramètre
        // pointant vers une autre agence ne fait fuiter aucune donnée de celle-ci.
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $clientB = Client::factory()->for($agencyB, 'agency')->create();

        Payment::create([
            'agency_id' => $agencyB->id, 'client_id' => $clientB->id, 'method' => 'espece',
            'amount' => 50000, 'status' => 'complete', 'paid_at' => now(),
        ]);

        $response = $this->actingAs($accueilA)->getJson("/api/cash/stats?agency_id={$agencyB->id}");

        $response->assertOk();
        $response->assertJsonPath('revenue_today', 0);
    }
}
