<?php

namespace Tests\Feature\Platform;

use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PressingReportIngestionTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    private function validPayload(): array
    {
        return [
            'agencies_count' => 5,
            'active_users_count' => 42,
            'operations_count' => 128,
            'period_started_at' => now()->subHour()->toISOString(),
            'period_ended_at' => now()->toISOString(),
            'app_version' => '1.4.2',
        ];
    }

    public function test_a_valid_token_ingests_a_report_and_updates_denormalized_counts(): void
    {
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Orchid Clean', 'code' => 'OC-01', 'platform_plan_id' => $plan->id]);
        $token = $pressing->generateReportToken();

        $response = $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/platform/reports', $this->validPayload());

        $response->assertCreated();
        $pressing->refresh();
        $this->assertSame(5, $pressing->agencies_count);
        $this->assertSame(42, $pressing->users_count);
        $this->assertNotNull($pressing->last_report_at);
        $this->assertDatabaseHas('pressing_report_logs', ['pressing_id' => $pressing->id, 'operations_count' => 128]);
    }

    public function test_a_missing_token_is_rejected(): void
    {
        $response = $this->postJson('/api/platform/reports', $this->validPayload());

        $response->assertStatus(401);
    }

    public function test_an_invalid_token_is_rejected(): void
    {
        $response = $this->withHeader('Authorization', 'Bearer not-a-real-token')->postJson('/api/platform/reports', $this->validPayload());

        $response->assertStatus(401);
    }

    public function test_a_malformed_payload_is_rejected(): void
    {
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Luxe Press', 'code' => 'LP-01', 'platform_plan_id' => $plan->id]);
        $token = $pressing->generateReportToken();

        $response = $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/platform/reports', ['agencies_count' => -1]);

        $response->assertStatus(422);
    }

    public function test_using_the_token_updates_its_last_used_timestamp(): void
    {
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Net Plus Dakar', 'code' => 'NPD-01', 'platform_plan_id' => $plan->id]);
        $token = $pressing->generateReportToken();
        $this->assertNull($pressing->report_token_last_used_at);

        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/platform/reports', $this->validPayload());

        $this->assertNotNull($pressing->fresh()->report_token_last_used_at);
    }
}
