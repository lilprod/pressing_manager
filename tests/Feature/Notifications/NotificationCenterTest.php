<?php

namespace Tests\Feature\Notifications;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Client;
use App\Models\NotificationLog;
use App\Models\NotificationSetting;
use App\Models\Order;
use App\Notifications\TemplatedMailNotification;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class NotificationCenterTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_templates_list_defaults_and_custom_template_is_used_with_real_variables(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['first_name' => 'Aminata', 'email' => 'aminata@example.test']);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        $list = $this->actingAs($manager)->getJson("/api/notification-templates?agency_id={$agency->id}")->assertOk();
        $this->assertCount(count(NotificationSetting::EVENTS) * 2, $list->json('templates'));

        $this->actingAs($manager)->putJson("/api/notification-templates?agency_id={$agency->id}", [
            'event' => 'order_received', 'channel' => 'mail', 'name' => 'Accueil', 'subject' => 'Dépôt {{depot.numero}}', 'body' => 'Bonjour {{client.prenom}} !',
        ])->assertOk()->assertJson(['is_custom' => true]);

        app(NotificationService::class)->notifyEvent($agency->id, 'order_received', $client, ['order' => $order]);

        Notification::assertSentOnDemand(TemplatedMailNotification::class, fn ($n) => $n->body === 'Bonjour Aminata !');
    }

    public function test_preview_renders_with_the_latest_real_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['first_name' => 'Kofi']);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        $preview = $this->actingAs($manager)->postJson("/api/notification-templates/preview?agency_id={$agency->id}", ['body' => 'Bonjour {{client.prenom}}'])->assertOk();

        $this->assertSame('Bonjour Kofi', $preview->json('body'));
        $this->assertSame(1, $preview->json('sms_segments'));
    }

    public function test_send_test_logs_a_test_entry_excluded_from_stats(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $this->actingAs($manager)->postJson("/api/notifications/test?agency_id={$agency->id}", [
            'event' => 'order_ready', 'channel' => 'mail', 'recipient' => 'qa@example.test', 'subject' => 'Test', 'body' => 'Corps',
        ])->assertCreated();

        $this->assertTrue(NotificationLog::where('is_test', true)->exists());
        $this->assertSame([], $this->actingAs($manager)->getJson("/api/notification-stats?agency_id={$agency->id}")->json('mail'));
    }

    public function test_quiet_hours_defer_non_urgent_events_and_flush_sends_them(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['email' => 'c@example.test']);
        AgencySetting::forAgency($agency->id)->update(['notif_quiet_enabled' => true, 'notif_quiet_start' => '00:00', 'notif_quiet_end' => '23:59']);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);

        app(NotificationService::class)->notifyEvent($agency->id, 'order_processing', $client, ['order' => $order]);
        app(NotificationService::class)->notifyEvent($agency->id, 'order_received', $client, ['order' => $order]);

        $this->assertSame('deferred', NotificationLog::where('event', 'order_processing')->value('status'));
        $this->assertSame('sent', NotificationLog::where('event', 'order_received')->value('status'));

        NotificationLog::where('status', 'deferred')->update(['scheduled_for' => now()->subMinute()]);
        $this->artisan('notifications:flush-deferred')->assertSuccessful();
        $this->assertSame('sent', NotificationLog::where('event', 'order_processing')->value('status'));
    }

    public function test_marketing_events_respect_client_consent(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['email' => 'c@example.test', 'email_consent' => false]);

        app(NotificationService::class)->notifyEvent($agency->id, 'loyalty_points', $client, ['points' => 10]);

        $this->assertSame('skipped', NotificationLog::where('event', 'loyalty_points')->value('status'));
        Notification::assertNothingSent();
    }

    public function test_order_creation_triggers_order_received_and_delay_command_notifies_once(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['email' => 'late@example.test']);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'status' => 'en_traitement', 'promised_at' => now()->subHour()]);

        $this->artisan('notifications:send-delays')->assertSuccessful();
        $this->artisan('notifications:send-delays')->assertSuccessful();

        $this->assertSame(1, NotificationLog::where('event', 'order_delayed')->count());
    }

    public function test_rules_update_and_logs_export(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $this->actingAs($manager)->patchJson("/api/notification-rules?agency_id={$agency->id}", ['notif_quiet_enabled' => true, 'notif_quiet_start' => '21:00'])->assertOk();
        $this->assertTrue(AgencySetting::forAgency($agency->id)->notif_quiet_enabled);

        $this->actingAs($manager)->get("/api/notification-logs/export?agency_id={$agency->id}")->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    }

    public function test_unsubscribe_link_withdraws_email_consent(): void
    {
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['email_consent' => true]);

        $this->get(\Illuminate\Support\Facades\URL::signedRoute('notifications.unsubscribe', ['client' => $client->id]))->assertOk();
        $this->assertFalse($client->fresh()->email_consent);
        $this->get("/notifications/unsubscribe/{$client->id}")->assertForbidden();
    }
}
