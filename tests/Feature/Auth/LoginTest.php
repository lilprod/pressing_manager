<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_login_returns_a_token_for_valid_credentials(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
        ]);

        $response->assertOk()->assertJsonStructure(['token', 'user']);
        // Le frontend décide de l'affichage (ex. lien "Clients") sur la base de ces permissions
        // dès la connexion, sans attendre un rechargement complet qui rappellerait /me.
        $slugs = collect($response->json('user.role.permissions'))->pluck('slug');
        $this->assertTrue($slugs->contains('clients.manage'));
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
            'device_name' => 'phpunit',
        ]);

        $response->assertStatus(422);
    }

    public function test_a_protected_route_rejects_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/me');

        $response->assertStatus(401);
    }

    public function test_the_account_locks_after_five_failed_attempts(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
                'device_name' => 'phpunit',
            ]);
            $response->assertStatus(422);
        }

        $user->refresh();
        $this->assertTrue($user->isLocked());

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
        ]);

        $response->assertStatus(423);
    }

    public function test_a_successful_login_resets_the_failed_attempts_counter(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
                'device_name' => 'phpunit',
            ])->assertStatus(422);
        }

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
        ])->assertOk();

        $user->refresh();
        $this->assertSame(0, $user->failed_login_attempts);
        $this->assertNull($user->locked_until);
    }

    public function test_a_locked_account_is_rejected_even_with_the_correct_password(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil');
        $user->forceFill(['locked_until' => now()->addMinutes(15)])->save();

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
        ]);

        $response->assertStatus(423);
    }
}
