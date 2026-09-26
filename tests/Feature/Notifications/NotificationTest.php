<?php

namespace Tests\Feature\Notifications;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Delivery;
use App\Models\NotificationLog;
use App\Models\NotificationSetting;
use App\Models\Order;
use App\Models\OrderItem;
use App\Notifications\DeliveryCompletedNotification;
use App\Notifications\DeliveryFailedNotification;
use App\Notifications\OrderReadyNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeOrderWithItems(Agency $agency, int $itemCount, string $status = 'controle_qualite'): Order
    {
        $client = Client::factory()->create(['agency_id' => $agency->id, 'email' => 'client@example.com', 'phone' => '+22890000000']);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        OrderItem::factory()->count($itemCount)->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'status' => $status]);

        return $order;
    }

    public function test_order_ready_notification_fires_only_once_all_items_are_ready(): void
    {
        $this->seedRbac();
        Notification::fake();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $order = $this->makeOrderWithItems($agency, 2);
        [$item1, $item2] = $order->items;

        $this->actingAs($technicien)->patchJson("/api/order-items/{$item1->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ])->assertOk();

        Notification::assertNothingSent();

        $this->actingAs($technicien)->patchJson("/api/order-items/{$item2->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ])->assertOk();

        Notification::assertSentOnDemand(OrderReadyNotification::class);
    }

    public function test_order_ready_notification_is_logged(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $order = $this->makeOrderWithItems($agency, 1);
        $item = $order->items->first();

        $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ])->assertOk();

        $this->assertDatabaseHas('notification_logs', [
            'agency_id' => $agency->id,
            'event' => 'order_ready',
            'channel' => 'mail',
            'status' => 'sent',
        ]);
    }

    public function test_disabling_the_email_channel_for_an_event_suppresses_it(): void
    {
        $this->seedRbac();
        Notification::fake();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        NotificationSetting::create(['agency_id' => $agency->id, 'event' => 'order_ready', 'channel_email' => false, 'channel_sms' => false]);
        $order = $this->makeOrderWithItems($agency, 1);
        $item = $order->items->first();

        $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ])->assertOk();

        Notification::assertNothingSent();
        $this->assertDatabaseCount('notification_logs', 0);
    }

    public function test_enabling_sms_simulates_it_and_logs_it(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        NotificationSetting::create(['agency_id' => $agency->id, 'event' => 'order_ready', 'channel_email' => false, 'channel_sms' => true]);
        $order = $this->makeOrderWithItems($agency, 1);
        $item = $order->items->first();

        $this->actingAs($technicien)->patchJson("/api/order-items/{$item->id}/status", [
            'status' => 'pret',
            'quality_check_result' => 'ok',
        ])->assertOk();

        $this->assertDatabaseHas('notification_logs', [
            'agency_id' => $agency->id,
            'event' => 'order_ready',
            'channel' => 'sms',
            'recipient' => '+22890000000',
            'status' => 'simulated',
        ]);
    }

    public function test_delivery_completion_and_failure_trigger_their_notifications(): void
    {
        $this->seedRbac();
        Notification::fake();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        $client = Client::factory()->create(['agency_id' => $agency->id, 'email' => 'client@example.com']);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        $delivery = Delivery::factory()->create([
            'agency_id' => $agency->id,
            'order_id' => $order->id,
            'livreur_id' => $livreur->id,
            'status' => 'en_cours',
        ]);

        $this->actingAs($livreur)->post("/api/deliveries/{$delivery->id}/complete", [
            'photo' => UploadedFile::fake()->image('preuve.jpg'),
            'signature' => UploadedFile::fake()->image('signature.png'),
            'latitude' => 6.13,
            'longitude' => 1.22,
        ])->assertOk();

        Notification::assertSentOnDemand(DeliveryCompletedNotification::class);

        $delivery2 = Delivery::factory()->create([
            'agency_id' => $agency->id,
            'order_id' => $order->id,
            'livreur_id' => $livreur->id,
            'status' => 'en_cours',
        ]);

        $this->actingAs($livreur)->postJson("/api/deliveries/{$delivery2->id}/fail", [
            'reason' => 'Client absent',
        ])->assertOk();

        Notification::assertSentOnDemand(DeliveryFailedNotification::class);
    }

    public function test_notification_settings_endpoint_returns_defaults_for_unconfigured_events(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $response = $this->actingAs($manager)->getJson('/api/notification-settings');

        $response->assertOk();
        $events = collect($response->json())->pluck('event');
        $this->assertSame(NotificationSetting::EVENTS, $events->all());
        $this->assertTrue(collect($response->json())->every(fn ($s) => $s['channel_email'] === true && $s['channel_sms'] === false));
    }

    public function test_updating_a_notification_setting_persists_it(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $response = $this->actingAs($manager)->postJson('/api/notification-settings', [
            'event' => 'delivery_completed',
            'channel_email' => false,
            'channel_sms' => true,
        ]);

        $response->assertOk();

        $listed = $this->actingAs($manager)->getJson('/api/notification-settings');
        $setting = collect($listed->json())->firstWhere('event', 'delivery_completed');
        $this->assertFalse($setting['channel_email']);
        $this->assertTrue($setting['channel_sms']);
    }

    public function test_only_notifications_manage_can_update_settings(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/notification-settings', [
            'event' => 'order_ready',
            'channel_email' => true,
            'channel_sms' => false,
        ]);

        $response->assertStatus(403);
    }

    public function test_notification_logs_are_scoped_per_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);
        NotificationLog::create([
            'agency_id' => $agencyA->id,
            'event' => 'order_ready',
            'channel' => 'mail',
            'recipient' => 'a@example.com',
            'message' => 'test',
            'status' => 'sent',
            'sent_at' => now(),
        ]);
        NotificationLog::create([
            'agency_id' => $agencyB->id,
            'event' => 'order_ready',
            'channel' => 'mail',
            'recipient' => 'b@example.com',
            'message' => 'test',
            'status' => 'sent',
            'sent_at' => now(),
        ]);

        $response = $this->actingAs($managerA)->getJson('/api/notification-logs');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('a@example.com', $response->json('data.0.recipient'));
    }
}
