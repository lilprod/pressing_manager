<?php

namespace Tests\Feature\AuditLogs;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_creating_an_order_is_recorded_in_the_audit_log(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = \App\Models\Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true]);

        $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
        ])->assertCreated();

        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => Order::class,
            'action' => Order::class.'.created',
            'user_id' => $accueil->id,
        ]);
    }

    public function test_an_order_audit_trail_includes_its_own_events_and_excludes_other_orders(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);
        $otherOrder = Order::factory()->create(['agency_id' => $agency->id]);
        $order->update(['notes' => 'Client attentif aux finitions.']);
        $otherOrder->update(['notes' => 'Ne devrait pas apparaître.']);

        $response = $this->actingAs($admin)->getJson("/api/orders/{$order->id}/audit-logs");

        $response->assertOk();
        $ids = collect($response->json())->pluck('auditable_id');
        $this->assertTrue($ids->contains($order->id));
        $actions = collect($response->json())->pluck('action');
        $this->assertTrue($actions->contains(Order::class.'.updated'));
    }

    public function test_the_order_audit_trail_requires_agency_access(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilB = $this->makeUser('accueil', $agencyB);
        $order = Order::factory()->create(['agency_id' => $agencyA->id]);

        $response = $this->actingAs($accueilB)->getJson("/api/orders/{$order->id}/audit-logs");

        $response->assertStatus(403);
    }

    public function test_the_global_audit_log_requires_the_audit_view_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/audit-logs');

        $response->assertStatus(403);
    }

    public function test_an_admin_can_list_the_global_audit_log_filtered_by_type(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin', $agency);
        Client::factory()->for($agency, 'agency')->create();
        Order::factory()->create(['agency_id' => $agency->id]);

        $response = $this->actingAs($admin)->getJson('/api/audit-logs?type=client');

        $response->assertOk();
        $types = collect($response->json('data'))->pluck('auditable_type')->unique();
        $this->assertEqualsCanonicalizing(['Client'], $types->all());
    }

    public function test_the_global_audit_log_is_scoped_to_the_users_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);
        Order::factory()->create(['agency_id' => $agencyA->id]);
        Order::factory()->create(['agency_id' => $agencyB->id]);

        $response = $this->actingAs($managerA)->getJson('/api/audit-logs?type=order');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }
}
