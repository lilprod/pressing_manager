<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformSettingTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_any_authenticated_platform_user_can_view_the_settings(): void
    {
        $pressing = $this->makePressing();
        $viewer = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');

        $response = $this->actingAs($viewer, 'platform')->getJson('/api/platform/settings');

        $response->assertOk();
        $response->assertJsonPath('app_name', 'ADMIN Pressing');
    }

    public function test_a_superadmin_can_update_the_settings(): void
    {
        $superadmin = $this->makePlatformUser();

        $response = $this->actingAs($superadmin, 'platform')->patchJson('/api/platform/settings', [
            'app_name' => 'Spark Console',
            'primary_color' => '#24483F',
            'support_email' => 'support@spark-pressing.test',
        ]);

        $response->assertOk();
        $response->assertJsonPath('app_name', 'Spark Console');
        $response->assertJsonPath('primary_color', '#24483F');
    }

    public function test_a_non_superadmin_cannot_update_the_settings(): void
    {
        $pressing = $this->makePressing();
        $admin = $this->makeTransversePlatformUser([$pressing->id], 'admin_transverse');

        $response = $this->actingAs($admin, 'platform')->patchJson('/api/platform/settings', [
            'app_name' => 'Hack',
        ]);

        $response->assertStatus(403);
    }
}
