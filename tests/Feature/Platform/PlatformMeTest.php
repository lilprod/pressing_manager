<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/**
 * `/me` doit exposer le rôle : la console superadmin décide des droits d'édition
 * (Paramètres, etc.) sur `platform_role.slug`, pas sur un appel supplémentaire.
 */
class PlatformMeTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_me_includes_the_platform_role_slug(): void
    {
        $user = $this->makePlatformUser();

        $this->actingAs($user, 'platform')->getJson('/api/platform/me')
            ->assertOk()
            ->assertJsonPath('platform_role.slug', 'superadmin');
    }
}
