<?php

namespace Tests\Feature\Platform;

use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PressingManagementTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_platform_user_can_create_list_and_update_a_pressing(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan('business');

        $created = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', [
            'name' => 'Éclat Royal',
            'code' => 'ECL-0018',
            'country_code' => 'CI',
            'platform_plan_id' => $plan->id,
            'contact_email' => 'contact@eclat-royal.ci',
        ]);
        $created->assertCreated();
        $created->assertJsonStructure(['id', 'name', 'report_token']);
        $this->assertNotEmpty($created->json('report_token'));

        $index = $this->actingAs($platformUser, 'platform')->getJson('/api/platform/pressings');
        $index->assertOk();
        $this->assertContains('Éclat Royal', $index->json('data.*.name'));

        $updated = $this->actingAs($platformUser, 'platform')->patchJson("/api/platform/pressings/{$created->json('id')}", [
            'contact_name' => 'Nadine Essomba',
        ]);
        $updated->assertOk();
        $updated->assertJsonPath('contact_name', 'Nadine Essomba');
    }

    public function test_two_pressings_cannot_share_the_same_code(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();
        Pressing::create(['name' => 'Maison Blanche', 'code' => 'MB-01', 'platform_plan_id' => $plan->id]);

        $response = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', [
            'name' => 'Doublon',
            'code' => 'MB-01',
            'platform_plan_id' => $plan->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_suspending_and_reactivating_a_pressing_toggles_its_status(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Le Centre d\'Or', 'code' => 'LCO-01', 'platform_plan_id' => $plan->id]);

        $suspended = $this->actingAs($platformUser, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/suspend");
        $suspended->assertOk();
        $suspended->assertJsonPath('status', 'suspended');

        $reactivated = $this->actingAs($platformUser, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/reactivate");
        $reactivated->assertOk();
        $reactivated->assertJsonPath('status', 'active');
    }

    public function test_rotating_the_report_token_invalidates_the_previous_one(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Prestige Clean', 'code' => 'PC-01', 'platform_plan_id' => $plan->id]);
        $oldToken = $pressing->generateReportToken();

        $response = $this->actingAs($platformUser, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/rotate-report-token");

        $response->assertOk();
        $newToken = $response->json('report_token');
        $this->assertNotSame($oldToken, $newToken);
        $this->assertNull(Pressing::findByReportToken($oldToken));
        $this->assertNotNull(Pressing::findByReportToken($newToken));
    }

    public function test_the_report_token_is_never_exposed_in_the_pressing_payload(): void
    {
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Velours & Soin', 'code' => 'VS-01', 'platform_plan_id' => $plan->id]);
        $pressing->generateReportToken();

        $response = $this->actingAs($platformUser, 'platform')->getJson("/api/platform/pressings/{$pressing->id}");

        $response->assertOk();
        $response->assertJsonMissing(['report_token_hash']);
    }
}
