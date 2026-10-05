<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Notifications\PasswordResetNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    protected function tearDown(): void
    {
        Str::createRandomStringsNormally();
        parent::tearDown();
    }

    public function test_forgot_password_sends_a_reset_email_for_an_existing_account(): void
    {
        Notification::fake();
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        $response = $this->postJson('/api/password/forgot', ['email' => $user->email]);

        $response->assertOk();
        Notification::assertSentTo($user, PasswordResetNotification::class);
    }

    public function test_forgot_password_returns_the_same_generic_message_for_an_unknown_email(): void
    {
        Notification::fake();
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        $unknown = $this->postJson('/api/password/forgot', ['email' => 'inconnu@example.com']);
        $known = $this->postJson('/api/password/forgot', ['email' => $user->email]);

        $this->assertSame($known->json('message'), $unknown->json('message'));
        Notification::assertSentTo($user, PasswordResetNotification::class);
    }

    public function test_a_full_forgot_then_reset_flow_lets_the_user_log_in_with_the_new_password(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        Str::createRandomStringsUsing(fn () => 'jeton-de-test-fixe');
        $this->postJson('/api/password/forgot', ['email' => $user->email])->assertOk();

        $this->postJson('/api/password/reset', [
            'token' => 'jeton-de-test-fixe',
            'password' => 'NouveauMotDePasse1!',
            'password_confirmation' => 'NouveauMotDePasse1!',
        ])->assertOk();

        $user->refresh();
        $this->assertTrue(Hash::check('NouveauMotDePasse1!', $user->password));

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'NouveauMotDePasse1!',
            'device_name' => 'phpunit',
        ])->assertOk();
    }

    public function test_an_expired_or_unknown_token_is_rejected(): void
    {
        $response = $this->postJson('/api/password/reset', [
            'token' => 'jeton-inexistant',
            'password' => 'NouveauMotDePasse1!',
            'password_confirmation' => 'NouveauMotDePasse1!',
        ]);

        $response->assertStatus(422);
    }

    public function test_the_reset_token_is_single_use(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        Str::createRandomStringsUsing(fn () => 'jeton-usage-unique');
        $this->postJson('/api/password/forgot', ['email' => $user->email])->assertOk();

        $this->postJson('/api/password/reset', [
            'token' => 'jeton-usage-unique',
            'password' => 'NouveauMotDePasse1!',
            'password_confirmation' => 'NouveauMotDePasse1!',
        ])->assertOk();

        $second = $this->postJson('/api/password/reset', [
            'token' => 'jeton-usage-unique',
            'password' => 'AutreMotDePasse2!',
            'password_confirmation' => 'AutreMotDePasse2!',
        ]);

        $second->assertStatus(422);
    }

    public function test_a_successful_reset_clears_an_existing_lockout(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());
        $user->forceFill(['failed_login_attempts' => 5, 'locked_until' => now()->addMinutes(15)])->save();

        Str::createRandomStringsUsing(fn () => 'jeton-anti-lockout');
        $this->postJson('/api/password/forgot', ['email' => $user->email])->assertOk();

        $this->postJson('/api/password/reset', [
            'token' => 'jeton-anti-lockout',
            'password' => 'NouveauMotDePasse1!',
            'password_confirmation' => 'NouveauMotDePasse1!',
        ])->assertOk();

        $user->refresh();
        $this->assertFalse($user->isLocked());
        $this->assertSame(0, $user->failed_login_attempts);
    }
}
