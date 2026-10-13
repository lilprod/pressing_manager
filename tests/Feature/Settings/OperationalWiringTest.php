<?php

namespace Tests\Feature\Settings;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Service;
use App\Services\DeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/** Réglages opérationnels réellement appliqués (audit Figma du 2026-10-13). */
class OperationalWiringTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function treatedOrder(Agency $agency): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'controle_qualite']);
        OrderItem::factory()->create([
            'order_id' => $order->id, 'agency_id' => $agency->id, 'service_id' => Service::factory()->create()->id,
            'quantity' => 1, 'unit_price' => 1000, 'status' => 'controle_qualite',
        ]);

        return $order;
    }

    private function pickup(Order $order, $user)
    {
        return $this->actingAs($user)->postJson("/api/orders/{$order->id}/pickups", [
            'recipient_type' => 'client', 'recipient_name' => 'Client', 'condition_status' => 'conforme',
            'items' => [['order_item_id' => $order->items()->first()->id, 'quantity' => 1]],
        ]);
    }

    public function test_immediate_pickup_setting_controls_handover_of_treated_items(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        AgencySetting::forAgency($agency->id)->update(['block_pickup_if_unpaid' => false, 'allow_immediate_pickup' => false]);

        $this->pickup($this->treatedOrder($agency), $accueil)->assertStatus(422);

        AgencySetting::forAgency($agency->id)->update(['allow_immediate_pickup' => true]);
        $order = $this->treatedOrder($agency);
        $this->assertContains($order->id, array_column($this->actingAs($accueil)->getJson('/api/pickups')->json('data'), 'id'));
        $this->pickup($order, $accueil)->assertCreated();
        $this->assertSame('livre', $order->items()->first()->status);
    }

    public function test_agency_default_delivery_fee_is_used_when_no_fee_or_zone(): void
    {
        $agency = Agency::factory()->create();
        AgencySetting::forAgency($agency->id)->update(['delivery_fee' => 2000]);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => Client::factory()->for($agency, 'agency')->create()->id]);

        $delivery = app(DeliveryService::class)->createForOrder($order, 'Rue 12', null, null, null, null, null);
        $this->assertSame(2000, $delivery->fee);

        $explicit = app(DeliveryService::class)->createForOrder($order, 'Rue 12', null, null, null, 500, null);
        $this->assertSame(500, $explicit->fee);
    }

    public function test_numbering_lists_and_updates_every_agency(): void
    {
        $this->seedRbac();
        $a = Agency::factory()->create(['name' => 'Plateau']);
        $b = Agency::factory()->create(['name' => 'Marcory', 'pressing_id' => $a->pressing_id]);
        // Pressing étranger créé avant tout actingAs() (piège PlatformAuditable, CLAUDE.md).
        $foreign = Agency::factory()->create(['pressing_id' => \App\Models\Pressing::factory()->create()->id]);
        $admin = $this->makeUser('admin');

        $list = $this->actingAs($admin)->getJson('/api/agency-settings/numbering')->assertOk()->json();
        $this->assertContains($a->id, array_column($list, 'agency_id'));

        $this->actingAs($admin)->putJson('/api/agency-settings/numbering', ['agencies' => [
            ['agency_id' => $a->id, 'order_number_prefix' => 'PL-', 'order_number_suffix' => '-26'],
            ['agency_id' => $b->id, 'order_number_prefix' => 'MC-', 'order_number_suffix' => null],
        ]])->assertOk();

        $this->assertSame('PL-', AgencySetting::forAgency($a->id)->order_number_prefix);
        $this->assertSame('MC-', AgencySetting::forAgency($b->id)->order_number_prefix);

        $this->actingAs($admin)->putJson('/api/agency-settings/numbering', ['agencies' => [
            ['agency_id' => $foreign->id, 'order_number_prefix' => 'X'],
        ]])->assertForbidden();
    }

    public function test_promotion_orders_earn_no_points_when_accrual_is_disabled(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $service = Service::factory()->create(['base_price' => 10000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        \App\Models\Promotion::factory()->create([
            'pressing_id' => $agency->pressing_id, 'code' => 'P10', 'discount_type' => 'percentage', 'discount_value' => 10,
            'is_active' => true, 'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
        ]);
        AgencySetting::forAgency($agency->id)->update(['loyalty_accrue_on_promotions' => false, 'loyalty_amount_per_point' => 100]);

        $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id, 'items' => [['service_id' => $service->id, 'quantity' => 1]],
            'promotion_code' => 'P10', 'payment_method' => 'espece', 'payment_amount' => 100000,
        ])->assertCreated();

        $client->refresh();
        $this->assertSame(0, $client->loyalty_points);
        $this->assertGreaterThan(0, $client->loyalty_spend_12m);
    }

    public function test_offline_and_promotion_toggles_are_persisted(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->patchJson("/api/agencies/{$agency->id}/settings", ['offline_enabled' => false, 'loyalty_accrue_on_promotions' => false])
            ->assertOk()->assertJson(['offline_enabled' => false, 'loyalty_accrue_on_promotions' => false]);
    }

    public function test_notify_ready_resends_through_the_notification_pipeline(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['email' => 'ready@example.test']);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'pret']);

        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/notify-ready")->assertOk()->assertJson(['sent' => 1]);
        $this->assertDatabaseHas('notification_logs', ['order_id' => $order->id, 'event' => 'order_ready']);

        $other = Order::factory()->create(['agency_id' => Agency::factory()->create(['pressing_id' => $agency->pressing_id])->id]);
        $this->actingAs($accueil)->postJson("/api/orders/{$other->id}/notify-ready")->assertForbidden();
    }

    public function test_agency_detail_exposes_hours_cash_and_deposit_summaries(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->patchJson("/api/agencies/{$agency->id}", ['opens_at' => '00:00', 'closes_at' => '23:59'])->assertOk();
        $this->actingAs($admin)->patchJson("/api/agencies/{$agency->id}", ['opens_at' => '18:00', 'closes_at' => '08:00'])->assertStatus(422);

        $client = Client::factory()->for($agency, 'agency')->create();
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'is_express' => true, 'total_amount' => 4000]);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'is_express' => false, 'total_amount' => 2000]);

        $detail = $this->actingAs($admin)->getJson("/api/multi-agencies/{$agency->id}")->assertOk();
        $detail->assertJsonPath('agency.opens_at', '00:00');
        $detail->assertJsonPath('agency.is_open_now', true);
        $detail->assertJsonPath('deposits_summary.deposits', 2);
        $detail->assertJsonPath('deposits_summary.express', 1);
        $detail->assertJsonPath('deposits_summary.average_basket', 3000);
        $this->assertArrayHasKey('expected_balance', $detail->json('cash_today'));
    }
}
