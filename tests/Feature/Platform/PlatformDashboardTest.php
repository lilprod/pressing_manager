<?php

namespace Tests\Feature\Platform;

use App\Models\Pressing;
use App\Models\PressingReportLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformDashboardTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    /** agencies_count/users_count ne sont pas mass-assignables (écrits uniquement via un rapport réel) — on simule l'effet d'un rapport déjà reçu pour les fixtures de ce test. */
    private function withReportedCounts(Pressing $pressing, int $agencies, int $users): Pressing
    {
        $pressing->forceFill(['agencies_count' => $agencies, 'users_count' => $users])->save();

        return $pressing;
    }

    public function test_kpi_counts_match_seeded_fixtures(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();

        $this->withReportedCounts(Pressing::create(['name' => 'A', 'code' => 'A-01', 'platform_plan_id' => $plan->id, 'status' => 'active']), 3, 10);
        $this->withReportedCounts(Pressing::create(['name' => 'B', 'code' => 'B-01', 'platform_plan_id' => $plan->id, 'status' => 'active']), 2, 5);
        $this->withReportedCounts(Pressing::create(['name' => 'C', 'code' => 'C-01', 'platform_plan_id' => $plan->id, 'status' => 'suspended']), 100, 100);

        $response = $this->actingAs($platformUser, 'platform')->getJson('/api/platform/dashboard');

        $response->assertOk();
        $response->assertJsonPath('tenants_actifs', 2);
        $response->assertJsonPath('agences_total', 5);
        $response->assertJsonPath('utilisateurs_total', 15);
        // La suspendue (agencies_count=100) n'est pas comptée dans les totaux "actifs".
        $this->assertNotSame(105, $response->json('agences_total'));
    }

    public function test_license_health_percentages_do_not_need_to_sum_to_100(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();

        Pressing::create(['name' => 'A', 'code' => 'A-01', 'platform_plan_id' => $plan->id, 'status' => 'active', 'license_expires_at' => now()->addDays(10)]);
        Pressing::create(['name' => 'B', 'code' => 'B-01', 'platform_plan_id' => $plan->id, 'status' => 'suspended']);

        $response = $this->actingAs($platformUser, 'platform')->getJson('/api/platform/dashboard');

        $response->assertOk();
        // A est à la fois "active" et "à renouveler" (licence expire dans 10j) : les deux
        // pourcentages comptent A, la somme dépasse donc 100% par construction.
        $health = $response->json('license_health');
        $this->assertEquals(50.0, $health['active_pct']);
        $this->assertEquals(50.0, $health['renewal_due_pct']);
        $this->assertEquals(50.0, $health['suspended_pct']);
    }

    public function test_the_activity_series_excludes_reports_older_than_the_window(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'A', 'code' => 'A-01', 'platform_plan_id' => $plan->id]);

        PressingReportLog::create([
            'pressing_id' => $pressing->id,
            'agencies_count' => 1,
            'active_users_count' => 1,
            'operations_count' => 999,
            'period_started_at' => now()->subDays(20),
            'period_ended_at' => now()->subDays(20),
            'created_at' => now()->subDays(20),
        ]);
        PressingReportLog::create([
            'pressing_id' => $pressing->id,
            'agencies_count' => 1,
            'active_users_count' => 1,
            'operations_count' => 42,
            'period_started_at' => now(),
            'period_ended_at' => now(),
            'created_at' => now(),
        ]);

        $response = $this->actingAs($platformUser, 'platform')->getJson('/api/platform/dashboard');

        $response->assertOk();
        $series = $response->json('activity_series');
        $this->assertCount(14, $series);
        $total = array_sum(array_column($series, 'operations_count'));
        $this->assertSame(42, $total);
    }
}
