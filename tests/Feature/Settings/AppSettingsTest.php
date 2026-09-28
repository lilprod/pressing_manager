<?php

namespace Tests\Feature\Settings;

use App\Models\Agency;
use App\Models\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class AppSettingsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_settings_are_publicly_readable_without_authentication(): void
    {
        $response = $this->getJson('/api/settings');

        $response->assertOk();
        $response->assertJsonStructure(['pressing_name', 'address', 'logo_url', 'favicon_url']);
        $response->assertJsonPath('logo_url', null);
        $response->assertJsonPath('favicon_url', null);
    }

    public function test_an_admin_can_update_the_pressing_name_and_address(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->post('/api/settings', [
            'pressing_name' => 'Pressing Étoile',
            'address' => 'Boulevard du 13 janvier, Lomé',
        ]);

        $response->assertOk();
        $response->assertJsonPath('pressing_name', 'Pressing Étoile');
        $response->assertJsonPath('address', 'Boulevard du 13 janvier, Lomé');
    }

    public function test_an_admin_can_upload_a_logo_and_a_favicon(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->post('/api/settings', [
            'logo' => UploadedFile::fake()->image('logo.png'),
            'favicon' => UploadedFile::fake()->image('favicon.png'),
        ]);

        $response->assertOk();
        $this->assertNotNull($response->json('logo_url'));
        $this->assertNotNull($response->json('favicon_url'));

        $logo = $this->get($response->json('logo_url'));
        $logo->assertOk();
        $favicon = $this->get($response->json('favicon_url'));
        $favicon->assertOk();
    }

    public function test_uploading_a_new_logo_replaces_the_previous_one(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $first = $this->actingAs($admin)->post('/api/settings', [
            'logo' => UploadedFile::fake()->image('logo1.png'),
        ]);
        $firstPath = AppSetting::current()->logo_path;

        $this->actingAs($admin)->post('/api/settings', [
            'logo' => UploadedFile::fake()->image('logo2.png'),
        ]);
        $secondPath = AppSetting::current()->logo_path;

        $this->assertNotSame($firstPath, $secondPath);
        $this->assertFalse(\Illuminate\Support\Facades\Storage::disk(config('filesystems.default'))->exists($firstPath));
        $first->assertOk();
    }

    public function test_updating_settings_requires_the_agencies_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->post('/api/settings', [
            'pressing_name' => 'Pressing Étoile',
        ]);

        $response->assertStatus(403);
    }

    public function test_fetching_the_logo_returns_404_when_none_is_configured(): void
    {
        $response = $this->getJson('/api/settings/logo');

        $response->assertStatus(404);
    }
}
