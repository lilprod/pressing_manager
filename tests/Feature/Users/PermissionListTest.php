<?php

namespace Tests\Feature\Users;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class PermissionListTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_list_the_permissions(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->getJson('/api/permissions');

        $response->assertOk();
        $slugs = collect($response->json())->pluck('slug');
        $this->assertTrue($slugs->contains('users.manage'));
        $this->assertTrue($slugs->contains('orders.manage'));
    }

    public function test_listing_permissions_requires_the_users_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->getJson('/api/permissions');

        $response->assertStatus(403);
    }
}
