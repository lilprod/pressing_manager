<?php

namespace Tests\Feature\Platform\Auth;

use App\Models\PlatformUser;
use App\Services\TotpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformMfaTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_confirming_setup_with_a_correct_code_issues_a_token(): void
    {
        $user = PlatformUser::factory()->create(['password' => bcrypt('password')]);
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);
        $secret = $user->fresh()->totp_secret;
        $code = app(TotpService::class)->currentCode($secret);

        $response = $this->postJson('/api/platform/login/setup', ['challenge' => $login->json('challenge'), 'code' => $code]);

        $response->assertOk();
        $response->assertJsonStructure(['token', 'user', 'recovery_codes']);
        $this->assertCount(8, $response->json('recovery_codes'));
        $this->assertNotNull($user->fresh()->totp_enabled_at);
    }

    public function test_confirming_setup_with_an_incorrect_code_is_rejected(): void
    {
        $user = PlatformUser::factory()->create(['password' => bcrypt('password')]);
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response = $this->postJson('/api/platform/login/setup', ['challenge' => $login->json('challenge'), 'code' => '000000']);

        $response->assertStatus(422);
        $this->assertNull($user->fresh()->totp_enabled_at);
    }

    public function test_verifying_with_a_correct_code_issues_a_token(): void
    {
        $user = $this->makePlatformUser('password');
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response = $this->postJson('/api/platform/login/verify', [
            'challenge' => $login->json('challenge'),
            'code' => $this->currentTotpCode($user),
        ]);

        $response->assertOk();
        $response->assertJsonStructure(['token', 'user']);
    }

    public function test_verifying_with_an_incorrect_code_is_rejected(): void
    {
        $user = $this->makePlatformUser('password');
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $response = $this->postJson('/api/platform/login/verify', ['challenge' => $login->json('challenge'), 'code' => '000000']);

        $response->assertStatus(422);
    }

    public function test_a_recovery_code_can_be_used_once(): void
    {
        $user = PlatformUser::factory()->create(['password' => bcrypt('password')]);
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);
        $code = app(TotpService::class)->currentCode($user->fresh()->totp_secret);
        $setup = $this->postJson('/api/platform/login/setup', ['challenge' => $login->json('challenge'), 'code' => $code]);
        $recoveryCode = $setup->json('recovery_codes.0');

        $secondLogin = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $firstUse = $this->postJson('/api/platform/login/verify', ['challenge' => $secondLogin->json('challenge'), 'code' => $recoveryCode]);
        $firstUse->assertOk();

        $thirdLogin = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);
        $secondUse = $this->postJson('/api/platform/login/verify', ['challenge' => $thirdLogin->json('challenge'), 'code' => $recoveryCode]);
        $secondUse->assertStatus(422);
    }

    public function test_a_code_from_the_adjacent_time_window_is_accepted(): void
    {
        $user = $this->makePlatformUser('password');
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);
        $totp = app(TotpService::class);
        $adjacentCode = (function () use ($totp, $user) {
            // Génère le code du pas précédent via la même mécanique que TotpService::codeAt (réflexion minimale).
            $ref = new \ReflectionMethod($totp, 'codeAt');
            $ref->setAccessible(true);

            return $ref->invoke($totp, $user->totp_secret, intdiv(time(), 30) - 1);
        })();

        $response = $this->postJson('/api/platform/login/verify', ['challenge' => $login->json('challenge'), 'code' => $adjacentCode]);

        $response->assertOk();
    }
}
