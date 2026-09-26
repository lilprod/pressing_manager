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
}
