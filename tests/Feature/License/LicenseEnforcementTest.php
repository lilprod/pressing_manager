<?php

namespace Tests\Feature\License;

use App\Models\Agency;
use App\Models\License;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class LicenseEnforcementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_active_license_allows_normal_access(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->getJson("/api/clients?agency_id={$agency->id}");

        $response->assertOk();
    }

    public function test_a_license_in_grace_period_allows_reads_but_blocks_writes(): void
    {
        $this->seedRbac();
        License::query()->update(['expires_at' => now()->subDay(), 'grace_period_days' => 7]);
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

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
        License::query()->update(['expires_at' => now()->subDays(30), 'grace_period_days' => 7]);
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $blocked = $this->actingAs($admin)->getJson("/api/clients?agency_id={$agency->id}");
        $blocked->assertStatus(402);

        $stillAllowed = $this->actingAs($admin)->getJson('/api/license');
        $stillAllowed->assertOk()->assertJsonPath('status', 'expired');

        $me = $this->actingAs($admin)->getJson('/api/me');
        $me->assertOk();
    }

    public function test_renewing_the_license_extends_expiry_and_restores_access(): void
    {
        $this->seedRbac();
        License::query()->update(['expires_at' => now()->subDays(30), 'grace_period_days' => 7]);
        $admin = $this->makeUser('admin');

        $renew = $this->actingAs($admin)->postJson('/api/license/renew', [
            'plan' => 'mensuel',
            'method' => 'flooz',
            'external_reference' => 'FLZ-TEST-1',
        ]);

        $renew->assertCreated();
        $this->assertSame('active', License::current()->status);
        $this->assertTrue(License::current()->expires_at->isFuture());

        $agency = Agency::factory()->create();
        $this->actingAs($admin)->getJson("/api/clients?agency_id={$agency->id}")->assertOk();
    }

    public function test_a_user_without_licenses_permission_cannot_renew(): void
    {
        $this->seedRbac();
        $accueil = $this->makeUser('accueil', Agency::factory()->create());

        $response = $this->actingAs($accueil)->postJson('/api/license/renew', [
            'plan' => 'mensuel',
            'method' => 'espece',
        ]);

        $response->assertStatus(403);
    }
}
