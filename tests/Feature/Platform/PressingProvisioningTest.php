<?php

namespace Tests\Feature\Platform;

use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Pivot multi-tenant (CLAUDE.md « Pivot multi-tenant ») : vérifie que le
 * provisionnement superadmin produit réellement un espace tenant utilisable,
 * pas seulement une ligne de registre — le manager bootstrap doit pouvoir se
 * connecter sur le `/login` tenant habituel (pas `/superadmin/login`) et
 * atterrir dans le bon pressing/agence.
 */
class PressingProvisioningTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform, SeedsRbac;

    public function test_provisioning_a_pressing_creates_a_usable_tenant_space_for_its_manager(): void
    {
        $this->seedRbac();
        $platformUser = $this->makePlatformUser();
        $plan = $this->makePlatformPlan();

        $created = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', [
            'name' => 'Pressing du Sahel',
            'code' => 'SAHEL-01',
            'country_code' => 'SN',
            'platform_plan_id' => $plan->id,
            'contact_email' => 'contact@sahel-pressing.sn',
            'agency_code' => 'SAHEL-DK',
            'agency_name' => 'Pressing du Sahel — Dakar',
            'agency_city' => 'Dakar',
            'manager_name' => 'Awa Ndiaye',
            'manager_email' => 'awa@sahel-pressing.sn',
        ]);
        $created->assertCreated();

        $pressingId = $created->json('id');
        $managerEmail = $created->json('manager_email');
        $managerPassword = $created->json('manager_temporary_password');

        $this->assertDatabaseHas('agencies', [
            'pressing_id' => $pressingId,
            'code' => 'SAHEL-DK',
            'name' => 'Pressing du Sahel — Dakar',
        ]);

        // Le manager se connecte sur le login tenant habituel, pas un flux superadmin dédié.
        $login = $this->postJson('/api/login', [
            'email' => $managerEmail,
            'password' => $managerPassword,
            'device_name' => 'phpunit',
        ]);
        $login->assertOk();
        $this->assertSame($pressingId, $login->json('user.pressing_id'));
        $this->assertNull($login->json('user.agency_id'));

        $token = $login->json('token');

        $me = $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/me');
        $me->assertOk();
        $me->assertJsonPath('pressing_id', $pressingId);
        $me->assertJsonPath('must_change_password', true);

        // Un deuxième pressing, provisionné séparément, ne doit rien partager avec le premier.
        $secondAgencyCode = 'SAHEL-DK';
        $other = $this->actingAs($platformUser, 'platform')->postJson('/api/platform/pressings', [
            'name' => 'Pressing Teranga',
            'code' => 'TERANGA-01',
            'platform_plan_id' => $plan->id,
            'agency_code' => $secondAgencyCode,
            'agency_name' => 'Pressing Teranga — Siège',
            'manager_name' => 'Moussa Sow',
            'manager_email' => 'moussa@teranga-pressing.sn',
        ]);
        // Le code d'agence est réutilisable dans un autre pressing (unicité composite).
        $other->assertCreated();
        $this->assertNotSame($pressingId, $other->json('id'));
    }
}
