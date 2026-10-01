<?php

namespace Tests\Feature\Platform\Auth;

use App\Models\PlatformUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformLoginTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_valid_password_for_a_user_without_mfa_returns_a_setup_challenge(): void
    {
        $user = PlatformUser::factory()->create(['password' => bcrypt('password'), 'totp_secret' => null, 'totp_enabled_at' => null]);

        $response = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response->assertOk();
        $response->assertJson(['mfa_setup_required' => true]);
        $response->assertJsonStructure(['challenge', 'otpauth_uri']);
    }

    public function test_a_valid_password_for_a_user_with_mfa_returns_a_verify_challenge(): void
    {
        $user = $this->makePlatformUser('password');

        $response = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response->assertOk();
        $response->assertJson(['mfa_required' => true]);
        $response->assertJsonStructure(['challenge']);
    }

    public function test_an_invalid_password_is_rejected(): void
    {
        $user = $this->makePlatformUser('password');

        $response = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'wrong']);

        $response->assertStatus(422);
        $this->assertSame(1, $user->fresh()->failed_login_attempts);
    }

    public function test_the_account_locks_after_five_failed_attempts(): void
    {
        $user = $this->makePlatformUser('password');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'wrong']);
        }

        $this->assertNotNull($user->fresh()->locked_until);

        $response = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);
        $response->assertStatus(423);
    }

    public function test_a_locked_account_unlocks_once_the_lockout_expires(): void
    {
        $user = $this->makePlatformUser('password');
        $user->forceFill(['failed_login_attempts' => 5, 'locked_until' => now()->subMinute()])->save();

        $response = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response->assertOk();
    }

    public function test_an_inactive_account_is_rejected(): void
    {
        $user = $this->makePlatformUser('password');
        $user->forceFill(['is_active' => false])->save();

        $response = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response->assertStatus(422);
    }
}
