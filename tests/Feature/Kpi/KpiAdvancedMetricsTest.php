<?php

namespace Tests\Feature\Kpi;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyPointMovement;
use App\Models\LoyaltyTier;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class KpiAdvancedMetricsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makePayment(Agency $agency, int $amount, string $method, Carbon $paidAt): Payment
    {
        $client = Client::factory()->for($agency, 'agency')->create();

        return Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => $method,
            'amount' => $amount,
            'status' => 'complete',
            'paid_at' => $paidAt,
        ]);
    }

    public function test_revenue_series_fills_gaps_with_zero_at_day_granularity(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->makePayment($agency, 5000, 'espece', now());

        $from = now()->subDays(2)->toDateString();
        $to = now()->toDateString();

        $response = $this->actingAs($manager)->getJson("/api/kpi/revenue-series?from={$from}&to={$to}&granularity=day");

        $response->assertOk();
        $series = $response->json('series');
        $this->assertCount(3, $series);
        $this->assertSame(0, $series[0]['revenue']);
        $this->assertSame(0, $series[1]['revenue']);
        $this->assertSame(5000, $series[2]['revenue']);
    }

    public function test_revenue_series_aggregates_by_month(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $thisMonth = now()->startOfMonth()->addDays(2);
        $this->makePayment($agency, 3000, 'espece', $thisMonth);
        $this->makePayment($agency, 2000, 'espece', $thisMonth->copy()->addDay());

        $from = now()->startOfMonth()->toDateString();
        $to = now()->endOfMonth()->toDateString();

        $response = $this->actingAs($manager)->getJson("/api/kpi/revenue-series?from={$from}&to={$to}&granularity=month");

        $response->assertOk();
        $series = $response->json('series');
        $this->assertCount(1, $series);
        $this->assertSame(5000, $series[0]['revenue']);
    }

    public function test_revenue_series_requires_reports_view_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $this->actingAs($technicien)->getJson('/api/kpi/revenue-series')->assertStatus(403);
    }

    public function test_revenue_series_ignores_a_foreign_agency_id_for_a_local_user(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);
        $this->makePayment($agencyB, 90000, 'espece', now());

        $response = $this->actingAs($managerA)->getJson("/api/kpi/revenue-series?agency_id={$agencyB->id}");

        $response->assertOk();
        $total = collect($response->json('series'))->sum('revenue');
        $this->assertSame(0, $total);
    }

    public function test_kpi_response_includes_payments_by_method_for_the_period(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->makePayment($agency, 6000, 'espece', now());
        $this->makePayment($agency, 2000, 'flooz', now());
        $this->makePayment($agency, 2000, 'tmoney', now());

        $response = $this->actingAs($manager)->getJson('/api/kpi');

        $response->assertOk();
        $response->assertJsonPath('payments_by_method.espece.amount', 6000);
        $response->assertJsonPath('payments_by_method.espece.percent', 60);
        $response->assertJsonPath('payments_by_method.flooz.amount', 2000);
        $response->assertJsonPath('payments_by_method.tmoney.amount', 2000);
        $response->assertJsonPath('payments_by_method.carte.amount', 0);
    }

    public function test_kpi_response_includes_loyalty_tier_breakdown_and_points_issued(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $silver = LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Argent', 'min_spend_amount' => 50000, 'discount_rate' => 0.05, 'is_active' => true]);
        $gold = LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Or', 'min_spend_amount' => 150000, 'discount_rate' => 0.10, 'is_active' => true]);

        $silverClient = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 80, 'loyalty_spend_12m' => 80000, 'is_active' => true]);
        $goldClient = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 200, 'loyalty_spend_12m' => 200000, 'is_active' => true]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 0, 'loyalty_spend_12m' => 0, 'is_active' => true]);

        LoyaltyPointMovement::create(['client_id' => $silverClient->id, 'agency_id' => $agency->id, 'points' => 30, 'reason' => 'payment', 'created_at' => now()]);
        LoyaltyPointMovement::create(['client_id' => $goldClient->id, 'agency_id' => $agency->id, 'points' => 20, 'reason' => 'payment', 'created_at' => now()]);
        // Mouvement hors période : ne doit pas compter.
        LoyaltyPointMovement::create(['client_id' => $goldClient->id, 'agency_id' => $agency->id, 'points' => 999, 'reason' => 'payment', 'created_at' => now()->subYear()]);

        $response = $this->actingAs($manager)->getJson('/api/kpi?' . http_build_query(['from' => now()->subDay()->toDateString(), 'to' => now()->toDateString()]));

        $response->assertOk();
        $byTier = collect($response->json('loyalty.by_tier'))->keyBy('id');
        $this->assertSame(1, $byTier[$silver->id]['count']);
        $this->assertSame(1, $byTier[$gold->id]['count']);
        $response->assertJsonPath('loyalty.points_issued', 50);
        $response->assertJsonPath('loyalty.points_consumed', 0);
    }

    public function test_loyalty_and_payments_scoping_isolates_other_agencies(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);

        $this->makePayment($agencyB, 90000, 'carte', now());
        $clientB = Client::factory()->for($agencyB, 'agency')->create(['loyalty_points' => 500]);
        LoyaltyPointMovement::create(['client_id' => $clientB->id, 'agency_id' => $agencyB->id, 'points' => 500, 'reason' => 'payment', 'created_at' => now()]);

        $response = $this->actingAs($managerA)->getJson('/api/kpi');

        $response->assertOk();
        $response->assertJsonPath('payments_by_method.carte.amount', 0);
        $response->assertJsonPath('loyalty.points_issued', 0);
    }
}
