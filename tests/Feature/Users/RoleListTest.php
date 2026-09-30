<?php

namespace Tests\Feature\Users;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class RoleListTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_list_the_roles(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->getJson('/api/roles');

        $response->assertOk();
        $slugs = collect($response->json())->pluck('slug');
        $this->assertTrue($slugs->contains('accueil'));
        $this->assertTrue($slugs->contains('admin'));

        $adminRole = collect($response->json())->firstWhere('slug', 'admin');
        $permissionSlugs = collect($adminRole['permissions'])->pluck('slug');
        $this->assertTrue($permissionSlugs->contains('users.manage'));
    }

    public function test_each_role_reports_how_many_users_hold_it(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = \App\Models\Agency::factory()->create();
        $this->makeUser('accueil', $agency);
        $this->makeUser('accueil', $agency);

        $response = $this->actingAs($admin)->getJson('/api/roles');

        $response->assertOk();
        $roles = collect($response->json())->keyBy('slug');
        $this->assertSame(2, $roles['accueil']['users_count']);
        $this->assertSame(1, $roles['admin']['users_count']);
        $this->assertSame(0, $roles['livreur']['users_count']);
    }

    public function test_listing_roles_requires_the_users_manage_permission(): void
    {
        $this->seedRbac();
        $agency = \App\Models\Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->getJson('/api/roles');

        $response->assertStatus(403);
    }
}
