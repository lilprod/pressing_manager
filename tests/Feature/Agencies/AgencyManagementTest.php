<?php

namespace Tests\Feature\Agencies;

use App\Models\Agency;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class AgencyManagementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_create_an_agency(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->postJson('/api/agencies', [
            'code' => 'AG-NEW',
            'name' => 'Pressing Bè',
            'city' => 'Lomé',
            'phone' => '+228 90 00 00 00',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('code', 'AG-NEW');
        $response->assertJsonPath('is_active', true);
        $response->assertJsonPath('unclaimed_item_threshold_days', 30);
        $this->assertDatabaseHas('agencies', ['code' => 'AG-NEW', 'name' => 'Pressing Bè']);
    }

    public function test_creating_an_agency_requires_the_agencies_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/agencies', [
            'code' => 'AG-X',
            'name' => 'Pressing X',
        ]);

        $response->assertStatus(403);
    }

    public function test_an_agency_code_must_be_unique(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Agency::factory()->create(['code' => 'AG-DUP']);

        $response = $this->actingAs($admin)->postJson('/api/agencies', [
            'code' => 'AG-DUP',
            'name' => 'Pressing Doublon',
        ]);

        $response->assertStatus(422);
    }

    public function test_an_admin_can_update_an_agency(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create(['name' => 'Ancien nom', 'is_active' => true]);

        $response = $this->actingAs($admin)->patchJson("/api/agencies/{$agency->id}", [
            'name' => 'Nouveau nom',
            'is_active' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('name', 'Nouveau nom');
        $response->assertJsonPath('is_active', false);
    }

    public function test_updating_an_agency_code_to_an_existing_one_is_rejected(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Agency::factory()->create(['code' => 'AG-A']);
        $agencyB = Agency::factory()->create(['code' => 'AG-B']);

        $response = $this->actingAs($admin)->patchJson("/api/agencies/{$agencyB->id}", ['code' => 'AG-A']);

        $response->assertStatus(422);
    }

    public function test_an_admin_can_list_all_agencies_including_inactive_ones(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Agency::factory()->create(['name' => 'Agence active', 'is_active' => true]);
        Agency::factory()->create(['name' => 'Agence inactive', 'is_active' => false]);

        $response = $this->actingAs($admin)->getJson('/api/agencies/manage');

        $response->assertOk();
        $response->assertJsonCount(2, 'data');
    }

    public function test_listing_agencies_for_management_requires_the_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/agencies/manage');

        $response->assertStatus(403);
    }

    public function test_an_admin_can_view_a_single_agency_with_counts(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $this->makeUser('accueil', $agency);

        $response = $this->actingAs($admin)->getJson("/api/agencies/{$agency->id}");

        $response->assertOk();
        $response->assertJsonPath('id', $agency->id);
        $response->assertJsonPath('users_count', 1);
    }

    public function test_the_public_active_agency_list_still_excludes_inactive_agencies(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Agency::factory()->create(['name' => 'Agence active', 'is_active' => true]);
        Agency::factory()->create(['name' => 'Agence inactive', 'is_active' => false]);

        $response = $this->actingAs($admin)->getJson('/api/agencies');

        $response->assertOk();
        $response->assertJsonCount(1);
    }
}
