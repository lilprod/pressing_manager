<?php

namespace Tests\Feature\Users;

use App\Models\Agency;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_sees_the_full_directory_with_full_flag(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $accueil->update(['must_change_password' => true]);

        $response = $this->actingAs($admin)->getJson('/api/users?full=1');

        $response->assertOk();
        $emails = collect($response->json())->pluck('email');
        $this->assertTrue($emails->contains($accueil->email));
        $entry = collect($response->json())->firstWhere('id', $accueil->id);
        $this->assertSame(true, $entry['must_change_password']);
        $this->assertSame($agency->name, $entry['agency']['name']);
    }

    public function test_a_non_admin_ignores_the_full_flag_and_still_gets_the_lightweight_picker(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        // Un utilisateur avec seulement deliveries.manage (accueil) doit recevoir le format allégé.
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/users?full=1');

        $response->assertOk();
        $this->assertArrayNotHasKey('email', $response->json()[0] ?? []);
    }

    public function test_an_admin_can_create_a_user_and_receives_a_temporary_password(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $accueilRole = Role::where('slug', 'accueil')->firstOrFail();

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Nouvel Employé',
            'email' => 'nouvel.employe@pressing.tg',
            'role_id' => $accueilRole->id,
            'agency_id' => $agency->id,
        ]);

        $response->assertCreated();
        $this->assertNotEmpty($response->json('temporary_password'));

        $created = User::where('email', 'nouvel.employe@pressing.tg')->firstOrFail();
        $this->assertTrue($created->must_change_password);
        $this->assertTrue(Hash::check($response->json('temporary_password'), $created->password));
    }

    public function test_creating_a_user_with_an_agency_scoped_role_requires_an_agency(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $accueilRole = Role::where('slug', 'accueil')->firstOrFail();

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Sans Agence',
            'email' => 'sans.agence@pressing.tg',
            'role_id' => $accueilRole->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_a_local_admin_can_only_create_users_within_their_own_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $localAdmin = $this->makeUser('manager', $agencyA);
        $accueilRole = Role::where('slug', 'accueil')->firstOrFail();

        $response = $this->actingAs($localAdmin)->postJson('/api/users', [
            'name' => 'Employé Local',
            'email' => 'employe.local@pressing.tg',
            'role_id' => $accueilRole->id,
            'agency_id' => $agencyB->id, // tentative de contournement, doit être ignorée
        ]);

        $response->assertCreated();
        $created = User::where('email', 'employe.local@pressing.tg')->firstOrFail();
        $this->assertSame($agencyA->id, $created->agency_id);
    }

    public function test_creating_a_global_role_user_ignores_any_supplied_agency(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $adminRole = Role::where('slug', 'admin')->firstOrFail();

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Autre Admin',
            'email' => 'autre.admin@pressing.tg',
            'role_id' => $adminRole->id,
            'agency_id' => $agency->id,
        ]);

        $response->assertCreated();
        $this->assertNull(User::where('email', 'autre.admin@pressing.tg')->firstOrFail()->agency_id);
    }

    public function test_an_admin_can_update_a_users_role_and_active_status(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $user = $this->makeUser('accueil', $agency);
        $technicienRole = Role::where('slug', 'technicien')->firstOrFail();

        $response = $this->actingAs($admin)->patchJson("/api/users/{$user->id}", [
            'role_id' => $technicienRole->id,
            'is_active' => false,
        ]);

        $response->assertOk();
        $updated = $user->fresh();
        $this->assertSame($technicienRole->id, $updated->role_id);
        $this->assertFalse($updated->is_active);
    }

    public function test_a_local_manager_cannot_update_a_user_from_another_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $localManager = $this->makeUser('manager', $agencyA);
        $otherUser = $this->makeUser('accueil', $agencyB);

        $response = $this->actingAs($localManager)->patchJson("/api/users/{$otherUser->id}", [
            'name' => 'Tentative',
        ]);

        $response->assertStatus(403);
    }

    public function test_an_admin_can_reset_a_users_password(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $user = $this->makeUser('accueil', $agency);
        $originalHash = $user->password;

        $response = $this->actingAs($admin)->postJson("/api/users/{$user->id}/reset-password");

        $response->assertOk();
        $this->assertNotEmpty($response->json('temporary_password'));
        $updated = $user->fresh();
        $this->assertNotSame($originalHash, $updated->password);
        $this->assertTrue($updated->must_change_password);
        $this->assertNull($updated->password_changed_at);
        $this->assertTrue(Hash::check($response->json('temporary_password'), $updated->password));
    }

    public function test_creating_a_user_requires_the_users_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $accueilRole = Role::where('slug', 'accueil')->firstOrFail();

        $response = $this->actingAs($technicien)->postJson('/api/users', [
            'name' => 'Test',
            'email' => 'test.refuse@pressing.tg',
            'role_id' => $accueilRole->id,
            'agency_id' => $agency->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_creating_a_user_with_a_duplicate_email_is_rejected(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $agency = Agency::factory()->create();
        $existing = $this->makeUser('accueil', $agency);
        $accueilRole = Role::where('slug', 'accueil')->firstOrFail();

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Doublon',
            'email' => $existing->email,
            'role_id' => $accueilRole->id,
            'agency_id' => $agency->id,
        ]);

        $response->assertStatus(422);
    }
}
