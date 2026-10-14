<?php

namespace Tests\Feature\Platform;

use App\Models\Agency;
use App\Models\AuditLog;
use App\Models\AuthEvent;
use App\Models\Order;
use App\Models\PlatformIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/** Fiche pressing — synthèse réelle et journal d'activité du tenant (audit + connexions). */
class PressingOverviewActivityTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform, SeedsRbac;

    public function test_overview_reports_real_counts_health_and_offline_orders(): void
    {
        $this->seedRbac();
        $pressing = $this->makePressing();
        $agency = Agency::factory()->for($pressing)->create(['is_active' => true]);
        Agency::factory()->for($pressing)->create(['is_active' => false]);
        User::factory()->for($pressing)->create(['agency_id' => $agency->id, 'last_login_at' => now()->subDays(2)]);
        User::factory()->for($pressing)->create(['agency_id' => $agency->id, 'last_login_at' => now()->subDays(60)]);
        Order::factory()->for($agency)->create(['source' => 'offline_sync']);
        Order::factory()->for($agency)->create([]);
        PlatformIncident::create(['pressing_id' => $pressing->id, 'title' => 'Lenteur', 'priority' => 'P2', 'status' => 'open']);
        $admin = $this->makePlatformUser();

        $res = $this->actingAs($admin, 'platform')->getJson("/api/platform/pressings/{$pressing->id}/overview")->assertOk();

        $this->assertSame($res->json('agencies_total') - 1, $res->json('agencies_active'));
        $this->assertSame(2, $res->json('users_total'));
        $this->assertSame(1, $res->json('users_active_30d'));
        $this->assertSame('degrade', $res->json('health'));
        $this->assertSame(1, $res->json('offline_orders_total'));
    }

    public function test_activity_merges_tenant_audit_and_login_events_with_real_results(): void
    {
        $this->seedRbac();
        $pressing = $this->makePressing();
        $other = $this->makePressing('Autre');
        $agency = Agency::factory()->for($pressing)->create();
        $foreignAgency = Agency::factory()->for($other)->create();
        $user = User::factory()->for($pressing)->create(['agency_id' => $agency->id, 'name' => 'Nadia Koné']);
        AuditLog::query()->delete();
        AuthEvent::query()->delete();
        AuditLog::create(['agency_id' => $agency->id, 'user_id' => $user->id, 'action' => 'App\\Models\\Order.created', 'auditable_type' => Order::class, 'auditable_id' => 9, 'created_at' => now()]);
        AuditLog::create(['agency_id' => $foreignAgency->id, 'action' => 'App\\Models\\Order.created', 'auditable_type' => Order::class, 'auditable_id' => 10, 'created_at' => now()]);
        AuthEvent::record('login_failed', $user);
        AuthEvent::record('login', $user);
        $admin = $this->makePlatformUser();

        $all = $this->actingAs($admin, 'platform')->getJson("/api/platform/pressings/{$pressing->id}/activity")->assertOk();
        $this->assertSame(3, $all->json('total'));

        $failures = $this->getJson("/api/platform/pressings/{$pressing->id}/activity?result=failure")->assertOk();
        $this->assertSame(1, $failures->json('total'));
        $this->assertSame('login_failed', $failures->json('data.0.kind'));

        $security = $this->getJson("/api/platform/pressings/{$pressing->id}/activity?category=security")->assertOk();
        $this->assertSame(2, $security->json('total'));

        $search = $this->getJson("/api/platform/pressings/{$pressing->id}/activity?search=Nadia")->assertOk();
        $this->assertSame(3, $search->json('total'));
        $this->assertSame('Nadia Koné', $search->json('data.0.actor_name'));

        $this->get("/api/platform/pressings/{$pressing->id}/activity/export")->assertOk();
    }

    public function test_an_unassigned_transverse_user_cannot_read_the_activity(): void
    {
        $pressing = $this->makePressing();
        $transverse = $this->makePlatformUser('password', 'admin_transverse');

        $this->actingAs($transverse, 'platform')->getJson("/api/platform/pressings/{$pressing->id}/activity")->assertForbidden();
        $this->getJson("/api/platform/pressings/{$pressing->id}/overview")->assertForbidden();
    }
}
