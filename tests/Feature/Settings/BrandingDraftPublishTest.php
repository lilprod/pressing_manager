<?php

namespace Tests\Feature\Settings;

use App\Models\Agency;
use App\Models\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\Concerns\SeedsTenant;
use Tests\TestCase;

/**
 * Chantier Branding (CLAUDE.md « Branding — brouillon / publication + versions ») :
 * sauvegarder un brouillon ne doit jamais toucher les colonnes live ; publier
 * applique le brouillon + crée une version ; restaurer applique un ancien
 * instantané + crée une nouvelle version chaînée.
 */
class BrandingDraftPublishTest extends TestCase
{
    use RefreshDatabase, SeedsRbac, SeedsTenant;

    public function test_saving_a_draft_never_touches_the_live_columns(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        AppSetting::current($this->pressingId())->update(['pressing_name' => 'Nom publié']);

        $response = $this->actingAs($admin)->patchJson('/api/settings/draft', [
            'pressing_name' => 'Brouillon en cours',
        ]);

        $response->assertOk();
        $response->assertJsonPath('pressing_name', 'Nom publié');
        $response->assertJsonPath('draft_data.pressing_name', 'Brouillon en cours');
        $this->assertNotNull($response->json('draft_saved_at'));

        $this->assertDatabaseHas('app_settings', [
            'pressing_id' => $this->pressingId(),
            'pressing_name' => 'Nom publié',
        ]);
    }

    public function test_the_draft_is_merged_not_replaced(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->patchJson('/api/settings/draft', ['pressing_name' => 'Pressing Étoile']);
        $response = $this->actingAs($admin)->patchJson('/api/settings/draft', ['website' => 'https://exemple.ci']);

        $response->assertOk();
        $response->assertJsonPath('draft_data.pressing_name', 'Pressing Étoile');
        $response->assertJsonPath('draft_data.website', 'https://exemple.ci');
    }

    public function test_publishing_applies_the_draft_and_records_a_version(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Agency::factory()->count(3)->create(['pressing_id' => $this->pressingId()]);

        $this->actingAs($admin)->patchJson('/api/settings/draft', [
            'pressing_name' => 'Pressing Étoile',
            'ticket_footer' => 'Merci de votre confiance.',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/settings/publish');

        $response->assertOk();
        $response->assertJsonPath('pressing_name', 'Pressing Étoile');
        $response->assertJsonPath('ticket_footer', 'Merci de votre confiance.');
        $response->assertJsonPath('draft_data', null);
        $response->assertJsonPath('affected_agencies_count', 3);

        $this->assertDatabaseHas('app_settings', [
            'pressing_id' => $this->pressingId(),
            'pressing_name' => 'Pressing Étoile',
            'draft_data' => null,
        ]);
        $this->assertDatabaseHas('app_setting_versions', [
            'pressing_id' => $this->pressingId(),
            'published_by' => $admin->id,
        ]);
    }

    public function test_restoring_a_version_applies_its_snapshot_and_chains_a_new_version(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->patchJson('/api/settings/draft', ['pressing_name' => 'Première version']);
        $firstPublish = $this->actingAs($admin)->postJson('/api/settings/publish');
        $firstVersionId = $firstPublish->json('version_id');

        $this->actingAs($admin)->patchJson('/api/settings/draft', ['pressing_name' => 'Deuxième version']);
        $this->actingAs($admin)->postJson('/api/settings/publish');

        $response = $this->actingAs($admin)->postJson("/api/settings/versions/{$firstVersionId}/restore");

        $response->assertOk();
        $response->assertJsonPath('pressing_name', 'Première version');

        $this->assertDatabaseHas('app_setting_versions', [
            'id' => $response->json('version_id'),
            'restored_from_version_id' => $firstVersionId,
        ]);

        $versions = $this->actingAs($admin)->getJson('/api/settings/versions');
        $versions->assertOk();
        $this->assertCount(3, $versions->json());
    }

    public function test_discarding_a_draft_clears_it_without_touching_live_values(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        AppSetting::current($this->pressingId())->update(['pressing_name' => 'Nom publié']);
        $this->actingAs($admin)->patchJson('/api/settings/draft', ['pressing_name' => 'Brouillon jeté']);

        $response = $this->actingAs($admin)->postJson('/api/settings/draft/discard');

        $response->assertOk();
        $response->assertJsonPath('pressing_name', 'Nom publié');
        $response->assertJsonPath('draft_data', null);
    }

    public function test_it_requires_the_agencies_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $user = $this->makeUser('accueil', $agency);

        $this->actingAs($user)->patchJson('/api/settings/draft', ['pressing_name' => 'x'])->assertStatus(403);
        $this->actingAs($user)->postJson('/api/settings/publish')->assertStatus(403);
        $this->actingAs($user)->getJson('/api/settings/versions')->assertStatus(403);
    }

    public function test_a_version_cannot_be_restored_from_another_pressing(): void
    {
        $this->seedRbac();
        // Pressing/admin "étranger" créés AVANT tout actingAs() : Pressing utilise
        // PlatformAuditable (Auth::guard('platform')), et Sanctum résout ce guard via
        // la session active même quand on demande explicitement 'platform' — un
        // actingAs() tenant déjà actif ferait fuiter platform_user_id vers l'id du
        // tenant (même piège documenté sur GuardIsolationTest : actingAs() n'est pas
        // fiable pour tester l'isolation de guards Sanctum, seul un vrai jeton HTTP
        // l'est). On évite le piège en créant ces lignes hors de tout contexte authentifié.
        // $admin d'abord : les factories réutilisent le premier pressing déjà créé
        // dans la transaction du test, donc le créer en premier lui garantit le
        // pressing A plutôt que de se retrouver, par accident d'ordre, dans le même
        // pressing que $otherAdmin ci-dessous.
        $admin = $this->makeUser('admin');

        $otherPressingId = \App\Models\Pressing::factory()->create()->id;
        $otherAdmin = $this->makeUser('admin');
        $otherAdmin->forceFill(['pressing_id' => $otherPressingId])->save();

        $this->actingAs($admin)->patchJson('/api/settings/draft', ['pressing_name' => 'x']);
        $this->actingAs($admin)->postJson('/api/settings/publish');

        $version = \App\Models\AppSettingVersion::first();

        $response = $this->actingAs($otherAdmin)->postJson("/api/settings/versions/{$version->id}/restore");

        $response->assertStatus(403);
    }
}
