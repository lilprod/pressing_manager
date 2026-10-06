<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/**
 * Activation/désactivation de la double authentification depuis le profil superadmin
 * (même mécanique TOTP que la connexion, voir PlatformAuthController).
 */
class PlatformProfileMfaTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_setup_returns_a_secret_and_qr_code_without_enabling_mfa(): void
    {
        $user = $this->makePlatformUser();
        $user->forceFill(['totp_enabled_at' => null])->save();

        $response = $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/setup');

        $response->assertOk()->assertJsonStructure(['otpauth_uri', 'qr_code_data_uri']);
        $this->assertNotNull($user->fresh()->totp_secret);
        $this->assertNull($user->fresh()->totp_enabled_at);
    }

    public function test_setup_is_refused_when_mfa_is_already_enabled(): void
    {
        $user = $this->makePlatformUser();

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/setup')->assertStatus(422);
    }

    public function test_enable_with_a_valid_code_activates_mfa_and_returns_recovery_codes(): void
    {
        $user = $this->makePlatformUser();
        $user->forceFill(['totp_enabled_at' => null])->save();
        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/setup')->assertOk();
        $user->refresh();

        $response = $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/enable', [
            'code' => $this->currentTotpCode($user),
        ]);

        $response->assertOk()->assertJsonCount(8, 'recovery_codes');
        $this->assertNotNull($user->fresh()->totp_enabled_at);
        $this->assertCount(8, $user->fresh()->recoveryCodes);
    }

    public function test_enable_with_an_invalid_code_is_rejected(): void
    {
        $user = $this->makePlatformUser();
        $user->forceFill(['totp_enabled_at' => null])->save();
        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/setup')->assertOk();

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/enable', ['code' => '000000'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
        $this->assertNull($user->fresh()->totp_enabled_at);
    }

    public function test_enable_without_a_pending_secret_is_rejected(): void
    {
        $user = $this->makePlatformUser();
        $user->forceFill(['totp_enabled_at' => null, 'totp_secret' => null])->save();

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/enable', ['code' => '123456'])->assertStatus(422);
    }

    public function test_disable_requires_the_correct_password(): void
    {
        $user = $this->makePlatformUser('mot-de-passe-1234');

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/disable', [
            'password' => 'mauvais-mot-de-passe',
            'code' => $this->currentTotpCode($user),
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->assertNotNull($user->fresh()->totp_enabled_at);
    }

    public function test_disable_requires_a_valid_totp_or_recovery_code(): void
    {
        $user = $this->makePlatformUser('mot-de-passe-1234');

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/disable', [
            'password' => 'mot-de-passe-1234',
            'code' => '000000',
        ])->assertStatus(422)->assertJsonValidationErrors('code');

        $this->assertNotNull($user->fresh()->totp_enabled_at);
    }

    public function test_disable_with_password_and_code_turns_mfa_off_and_clears_recovery_codes(): void
    {
        $user = $this->makePlatformUser('mot-de-passe-1234');
        $user->regenerateRecoveryCodes();

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/disable', [
            'password' => 'mot-de-passe-1234',
            'code' => $this->currentTotpCode($user),
        ])->assertOk();

        $fresh = $user->fresh();
        $this->assertNull($fresh->totp_enabled_at);
        $this->assertNull($fresh->totp_secret);
        $this->assertCount(0, $fresh->recoveryCodes);
    }

    public function test_disable_accepts_a_recovery_code_in_place_of_a_totp_code(): void
    {
        $user = $this->makePlatformUser('mot-de-passe-1234');
        $codes = $user->regenerateRecoveryCodes();

        $this->actingAs($user, 'platform')->postJson('/api/platform/me/mfa/disable', [
            'password' => 'mot-de-passe-1234',
            'code' => $codes[0],
        ])->assertOk();

        $this->assertNull($user->fresh()->totp_enabled_at);
    }
}
