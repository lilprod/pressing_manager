<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
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

    public function test_a_global_user_can_choose_an_agency_of_their_own_pressing_at_login(): void
    {
        $this->seedRbac();
        $pressing = Pressing::factory()->create();
        $agency = Agency::factory()->create(['pressing_id' => $pressing->id]);
        $user = $this->makeUser('admin');
        $user->forceFill(['pressing_id' => $pressing->id])->save();

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
            'agency_id' => $agency->id,
        ]);

        $response->assertOk()->assertJsonPath('resolved_agency_id', $agency->id);
    }

    public function test_an_agency_outside_the_users_pressing_is_rejected_at_login(): void
    {
        $this->seedRbac();
        $pressing = Pressing::factory()->create();
        $user = $this->makeUser('admin');
        $user->forceFill(['pressing_id' => $pressing->id])->save();
        $foreignPressing = Pressing::factory()->create();
        $foreignAgency = Agency::factory()->create(['pressing_id' => $foreignPressing->id]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
            'agency_id' => $foreignAgency->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_a_local_user_providing_a_different_agency_id_is_rejected_at_login(): void
    {
        $this->seedRbac();
        $ownAgency = Agency::factory()->create();
        $otherAgency = Agency::factory()->create(['pressing_id' => $ownAgency->pressing_id]);
        $user = $this->makeUser('accueil', $ownAgency);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
            'agency_id' => $otherAgency->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_remembering_the_session_issues_a_long_lived_token(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
            'remember' => true,
        ])->assertOk();

        $token = PersonalAccessToken::where('tokenable_id', $user->id)->latest('id')->first();
        $this->assertNotNull($token->expires_at);
        $this->assertTrue($token->expires_at->isAfter(now()->addDays(29)));
    }

    public function test_a_default_login_issues_a_short_lived_token_not_an_eternal_one(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'phpunit',
        ])->assertOk();

        $token = PersonalAccessToken::where('tokenable_id', $user->id)->latest('id')->first();
        $this->assertNotNull($token->expires_at);
        $this->assertTrue($token->expires_at->isBefore(now()->addDays(1)));
    }
}
