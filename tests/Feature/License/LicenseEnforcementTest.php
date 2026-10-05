<?php

namespace Tests\Feature\License;

use App\Models\Agency;
use App\Models\License;
use App\Models\PlatformPlan;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Depuis l'harmonisation licence/plateforme (CLAUDE.md « Licence / facturation —
 * gap d'harmonisation »), chaque pressing a sa propre licence (`License::current
 * ($pressingId)`, auto-créée en essai de 30 jours au premier accès) — le
 * renouvellement est une action plateforme exclusive, plus un self-service tenant.
 */
class LicenseEnforcementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac, SeedsPlatform;

    public function test_an_active_license_allows_normal_access(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        $admin->update(['pressing_id' => $agency->pressing_id]);

        $response = $this->actingAs($admin)->getJson("/api/clients?agency_id={$agency->id}");

        $response->assertOk();
    }

    public function test_a_license_in_grace_period_allows_reads_but_blocks_writes(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        $admin->update(['pressing_id' => $agency->pressing_id]);
        License::current($agency->pressing_id)->update(['expires_at' => now()->subDay(), 'grace_period_days' => 7]);

        $read = $this->actingAs($admin)->getJson("/api/clients?agency_id={$agency->id}");
        $read->assertOk();

        $write = $this->actingAs($admin)->postJson('/api/clients', [
            'agency_id' => $agency->id,
            'first_name' => 'Jean',
            'last_name' => 'Dupont',
            'phone' => '+22890000099',
        ]);
        $write->assertStatus(402);
    }

    public function test_an_expired_license_past_grace_blocks_everything_except_license_routes(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        $admin->update(['pressing_id' => $agency->pressing_id]);
        License::current($agency->pressing_id)->update(['expires_at' => now()->subDays(30), 'grace_period_days' => 7]);

        $blocked = $this->actingAs($admin)->getJson("/api/clients?agency_id={$agency->id}");
        $blocked->assertStatus(402);

        $stillAllowed = $this->actingAs($admin)->getJson('/api/license');
        $stillAllowed->assertOk()->assertJsonPath('status', 'expired');

        $me = $this->actingAs($admin)->getJson('/api/me');
        $me->assertOk();
    }

    public function test_a_second_pressings_license_is_unaffected_by_the_first_ones_expiry(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $adminA = $this->makeUser('admin', $agencyA);
        $adminA->update(['pressing_id' => $agencyA->pressing_id]);
        License::current($agencyA->pressing_id)->update(['expires_at' => now()->subDays(30), 'grace_period_days' => 7]);

        $pressingB = Pressing::create(['name' => 'Pressing B', 'code' => 'PB-01', 'platform_plan_id' => $this->makePlatformPlan('pro-b')->id]);
        $agencyB = Agency::factory()->create(['pressing_id' => $pressingB->id]);
        $adminB = $this->makeUser('admin', $agencyB);
        $adminB->update(['pressing_id' => $pressingB->id]);

        $this->actingAs($adminA)->getJson("/api/clients?agency_id={$agencyA->id}")->assertStatus(402);
        $this->actingAs($adminB)->getJson("/api/clients?agency_id={$agencyB->id}")->assertOk();
    }

    public function test_the_platform_can_renew_a_pressings_license_and_restore_access(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        $admin->update(['pressing_id' => $agency->pressing_id]);
        License::current($agency->pressing_id)->update(['expires_at' => now()->subDays(30), 'grace_period_days' => 7]);

        $superadmin = $this->makePlatformUser();
        $plan = PlatformPlan::create(['slug' => 'mensuel-test', 'name' => 'Mensuel', 'price' => 15000, 'currency' => 'XOF', 'duration_days' => 30, 'is_active' => true]);

        $renew = $this->actingAs($superadmin, 'platform')->postJson("/api/platform/pressings/{$agency->pressing_id}/renew", [
            'platform_plan_id' => $plan->id,
            'method' => 'flooz',
            'external_reference' => 'FLZ-TEST-1',
        ]);

        $renew->assertCreated();
        $this->assertSame('active', License::current($agency->pressing_id)->status);
        // Guard explicite : actingAs(..., 'platform') ci-dessus a changé le guard par
        // défaut de l'application (Auth::shouldUse), ce qui ferait sinon authentifier
        // $admin sur le mauvais guard et renvoyer 401 côté tenant.
        $this->actingAs($admin, 'web')->getJson("/api/clients?agency_id={$agency->id}")->assertOk();
    }

    public function test_a_tenant_admin_can_no_longer_renew_their_own_license(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        $admin->update(['pressing_id' => $agency->pressing_id]);

        $response = $this->actingAs($admin)->postJson('/api/license/renew', ['plan' => 'mensuel', 'method' => 'espece']);

        $response->assertStatus(404);
    }
}
