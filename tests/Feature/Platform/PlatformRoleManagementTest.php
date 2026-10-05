<?php

namespace Tests\Feature\Platform;

use App\Models\PlatformPermission;
use App\Models\PlatformRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformRoleManagementTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_superadmin_can_create_a_custom_role(): void
    {
        $superadmin = $this->makePlatformUser();
        $permission = PlatformPermission::where('slug', 'reports.view')->firstOrFail();

        $response = $this->actingAs($superadmin, 'platform')->postJson('/api/platform/roles', [
            'name' => 'Support niveau 1',
            'permission_ids' => [$permission->id],
        ]);

        $response->assertCreated();
        $response->assertJsonPath('is_system', false);
        $this->assertCount(1, $response->json('permissions'));
    }

    public function test_a_non_superadmin_cannot_create_a_role(): void
    {
        $pressing = $this->makePressing();
        $admin = $this->makeTransversePlatformUser([$pressing->id], 'admin_transverse');

        $response = $this->actingAs($admin, 'platform')->postJson('/api/platform/roles', ['name' => 'X']);

        $response->assertStatus(403);
    }

    public function test_permissions_of_a_system_role_cannot_be_modified(): void
    {
        $superadmin = $this->makePlatformUser();
        $systemRole = PlatformRole::where('slug', 'auditeur_transverse')->firstOrFail();

        $response = $this->actingAs($superadmin, 'platform')->patchJson("/api/platform/roles/{$systemRole->id}", [
            'permission_ids' => [],
        ]);

        $response->assertStatus(409);
    }

    public function test_the_name_of_a_system_role_can_be_renamed(): void
    {
        $superadmin = $this->makePlatformUser();
        $systemRole = PlatformRole::where('slug', 'auditeur_transverse')->firstOrFail();

        $response = $this->actingAs($superadmin, 'platform')->patchJson("/api/platform/roles/{$systemRole->id}", [
            'name' => 'Auditeur (renommé)',
        ]);

        $response->assertOk();
        $response->assertJsonPath('name', 'Auditeur (renommé)');
    }
}
