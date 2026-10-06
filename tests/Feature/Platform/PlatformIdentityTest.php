<?php

namespace Tests\Feature\Platform;

use App\Models\PlatformSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Nom de la console : public (page de connexion) mais limité au nom et aux assets. */
class PlatformIdentityTest extends TestCase
{
    use RefreshDatabase;

    public function test_identity_is_public_and_exposes_only_name_and_assets(): void
    {
        PlatformSetting::current()->update([
            'app_name' => 'Spark Test',
            'support_email' => 'contact@example.test',
        ]);

        $this->getJson('/api/platform/settings/identity')
            ->assertOk()
            ->assertExactJson([
                'app_name' => 'Spark Test',
                'logo_url' => null,
                'favicon_url' => null,
            ]);
    }
}
