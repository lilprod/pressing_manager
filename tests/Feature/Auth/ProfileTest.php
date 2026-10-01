<?php

namespace Tests\Feature\Auth;

use App\Models\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\SeedsRbac;
use Tests\Concerns\SeedsTenant;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase, SeedsRbac, SeedsTenant;

    public function test_a_user_can_update_their_name_and_phone(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        $response = $this->actingAs($user)->post('/api/profile', [
            'name' => 'Nouveau Nom',
            'phone' => '+228 91 00 00 00',
        ]);

        $response->assertOk();
        $response->assertJsonPath('name', 'Nouveau Nom');
        $response->assertJsonPath('phone', '+228 91 00 00 00');
    }

    public function test_a_user_can_upload_a_profile_photo(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        $response = $this->actingAs($user)->post('/api/profile', [
            'photo' => UploadedFile::fake()->image('avatar.jpg'),
        ]);

        $response->assertOk();
        $this->assertNotNull($response->json('photo_url'));
        $this->get($response->json('photo_url'))->assertOk();
    }

    public function test_another_user_cannot_view_a_colleagues_photo_without_users_manage(): void
    {
        $this->seedRbac();
        $owner = $this->makeUser('accueil');
        $other = $this->makeUser('technicien');

        $this->actingAs($owner)->post('/api/profile', ['photo' => UploadedFile::fake()->image('avatar.jpg')]);

        $response = $this->actingAs($other)->getJson("/api/users/{$owner->id}/photo");

        $response->assertStatus(403);
    }

    public function test_a_user_can_change_their_password_with_the_correct_current_password(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        $response = $this->actingAs($user)->postJson('/api/profile/password', [
            'current_password' => 'password',
            'new_password' => 'NewSecure1',
            'new_password_confirmation' => 'NewSecure1',
        ]);

        $response->assertOk();
        $this->assertTrue(Hash::check('NewSecure1', $user->fresh()->password));
    }

    public function test_changing_the_password_clears_the_must_change_password_flag(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');
        $user->update(['must_change_password' => true]);

        $this->actingAs($user)->postJson('/api/profile/password', [
            'current_password' => 'password',
            'new_password' => 'NewSecure1',
            'new_password_confirmation' => 'NewSecure1',
        ]);

        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertNotNull($user->fresh()->password_changed_at);
    }

    public function test_changing_the_password_requires_the_correct_current_password(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        $response = $this->actingAs($user)->postJson('/api/profile/password', [
            'current_password' => 'wrong-password',
            'new_password' => 'NewSecure1',
            'new_password_confirmation' => 'NewSecure1',
        ]);

        $response->assertStatus(422);
    }

    public function test_a_new_password_must_satisfy_the_configured_policy(): void
    {
        $this->seedRbac();
        AppSetting::current($this->pressingId())->update(['password_min_length' => 12]);
        $user = $this->makeUser('accueil');

        $response = $this->actingAs($user)->postJson('/api/profile/password', [
            'current_password' => 'password',
            'new_password' => 'Short1',
            'new_password_confirmation' => 'Short1',
        ]);

        $response->assertStatus(422);
    }

    public function test_me_exposes_must_change_password_and_password_expired(): void
    {
        $this->seedRbac();
        AppSetting::current($this->pressingId())->update(['password_expiry_days' => 90]);
        $user = $this->makeUser('accueil');
        $user->update(['password_changed_at' => now()->subDays(100)]);

        $response = $this->actingAs($user)->getJson('/api/me');

        $response->assertOk();
        $response->assertJsonPath('password_expired', true);
    }

    public function test_a_recently_changed_password_is_not_reported_as_expired(): void
    {
        $this->seedRbac();
        AppSetting::current($this->pressingId())->update(['password_expiry_days' => 90]);
        $user = $this->makeUser('accueil');
        $user->update(['password_changed_at' => now()->subDays(5)]);

        $response = $this->actingAs($user)->getJson('/api/me');

        $response->assertOk();
        $response->assertJsonPath('password_expired', false);
    }

    public function test_password_expiry_is_disabled_when_not_configured(): void
    {
        $this->seedRbac();
        AppSetting::current($this->pressingId())->update(['password_expiry_days' => null]);
        $user = $this->makeUser('accueil');
        $user->update(['password_changed_at' => now()->subYears(2)]);

        $response = $this->actingAs($user)->getJson('/api/me');

        $response->assertOk();
        $response->assertJsonPath('password_expired', false);
    }

    public function test_me_exposes_the_computed_password_expiry_date(): void
    {
        $this->seedRbac();
        AppSetting::current($this->pressingId())->update(['password_expiry_days' => 90]);
        $user = $this->makeUser('accueil');
        $changedAt = now()->subDays(80)->startOfSecond();
        $user->update(['password_changed_at' => $changedAt]);

        $response = $this->actingAs($user)->getJson('/api/me');

        $response->assertOk();
        $this->assertTrue($changedAt->clone()->addDays(90)->equalTo($response->json('password_expires_at')));
    }

    public function test_password_expires_at_is_null_when_expiry_is_disabled(): void
    {
        $this->seedRbac();
        AppSetting::current($this->pressingId())->update(['password_expiry_days' => null]);
        $user = $this->makeUser('accueil');

        $response = $this->actingAs($user)->getJson('/api/me');

        $response->assertOk();
        $response->assertJsonPath('password_expires_at', null);
    }
}
