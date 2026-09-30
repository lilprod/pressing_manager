<?php

namespace Tests\Feature\Users;

use App\Models\Agency;
use App\Models\Permission;
use App\Models\Role;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class RoleManagementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_create_a_role_with_permissions(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $permission = Permission::where('slug', 'stocks.manage')->firstOrFail();

        $response = $this->actingAs($admin)->postJson('/api/roles', [
            'name' => 'Superviseur',
            'scope' => 'agency',
            'permission_ids' => [$permission->id],
        ]);

        $response->assertCreated();
        $response->assertJsonPath('slug', 'superviseur');
        $this->assertCount(1, $response->json('permissions'));
    }

    public function test_an_admin_can_update_a_role_s_permissions(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $role = Role::where('slug', 'technicien')->firstOrFail();
        $permission = Permission::where('slug', 'stocks.manage')->firstOrFail();

        $response = $this->actingAs($admin)->patchJson("/api/roles/{$role->id}", [
            'permission_ids' => [$permission->id],
        ]);

        $response->assertOk();
        $response->assertJsonPath('permissions.0.slug', 'stocks.manage');
    }

    public function test_a_system_role_cannot_be_deleted(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $role = Role::where('slug', 'livreur')->firstOrFail();

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$role->id}");

        $response->assertStatus(409);
        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_a_custom_role_assigned_to_users_cannot_be_deleted(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();

        $created = $this->actingAs($admin)->postJson('/api/roles', [
            'name' => 'Superviseur',
            'scope' => 'agency',
        ])->json();

        \App\Models\User::factory()->create(['role_id' => $created['id'], 'agency_id' => $agency->id]);

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$created['id']}");

        $response->assertStatus(409);
    }

    public function test_an_unused_custom_role_can_be_deleted(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/roles', [
            'name' => 'Superviseur',
            'scope' => 'agency',
        ])->json();

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$created['id']}");

        $response->assertNoContent();
    }

    public function test_creating_a_role_requires_the_users_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/roles', [
            'name' => 'Superviseur',
            'scope' => 'agency',
        ]);

        $response->assertStatus(403);
    }
}
