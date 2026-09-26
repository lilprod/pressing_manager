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
}
