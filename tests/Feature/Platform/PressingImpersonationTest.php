<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PressingImpersonationTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_superadmin_can_impersonate_a_pressings_manager(): void
    {
        $superadmin = $this->makePlatformUser();
        [$pressing, $manager] = $this->provisionPressingWithManager();

        $response = $this->actingAs($superadmin, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/impersonate");

        $response->assertOk();
        $response->assertJsonPath('tenant_user.email', $manager->email);
        $this->assertNotEmpty($response->json('token'));

        $this->assertDatabaseHas('platform_audit_logs', [
            'platform_user_id' => $superadmin->id,
            'action' => 'pressing.impersonated',
            'auditable_id' => $pressing->id,
        ]);
    }

    public function test_the_impersonation_token_actually_authenticates_on_the_tenant_side(): void
    {
        $superadmin = $this->makePlatformUser();
        [$pressing, $manager] = $this->provisionPressingWithManager();

        $response = $this->actingAs($superadmin, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/impersonate");
        $plainToken = $response->json('token');

        $me = $this->withHeader('Authorization', "Bearer {$plainToken}")->getJson('/api/me');

        $me->assertOk();
        $me->assertJsonPath('id', $manager->id);
    }

    public function test_impersonation_requires_the_dedicated_permission(): void
    {
        [$pressing] = $this->provisionPressingWithManager();
        $admin = $this->makeTransversePlatformUser([$pressing->id], 'admin_transverse');

        $response = $this->actingAs($admin, 'platform')->postJson("/api/platform/pressings/{$pressing->id}/impersonate");

        $response->assertStatus(403);
    }

    private function provisionPressingWithManager(): array
    {
        $pressing = $this->makePressing();
        $role = \App\Models\Role::firstOrCreate(['slug' => 'admin'], ['name' => 'Admin', 'scope' => 'global']);
        $manager = \App\Models\User::create([
            'pressing_id' => $pressing->id,
            'agency_id' => null,
            'role_id' => $role->id,
            'name' => 'Manager Bootstrap',
            'email' => 'manager-'.uniqid().'@test.pressing',
            'password' => bcrypt('password'),
            'is_active' => true,
        ]);

        return [$pressing, $manager];
    }
}
