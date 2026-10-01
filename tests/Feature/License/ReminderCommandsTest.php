<?php

namespace Tests\Feature\License;

use App\Models\Agency;
use App\Models\Client;
use App\Models\CustomerSubscription;
use App\Models\License;
use App\Models\SubscriptionPlan;
use App\Notifications\LicenseExpiringNotification;
use App\Notifications\SubscriptionExpiringNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class ReminderCommandsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_license_reminder_notifies_admins_exactly_at_configured_thresholds(): void
    {
        $this->seedRbac();
        Notification::fake();
        License::query()->update(['expires_at' => now()->addDays(7)->endOfDay()->subSeconds(1), 'grace_period_days' => 7]);
        $admin = $this->makeUser('admin');

        $this->artisan('licenses:send-reminders')->assertSuccessful();

        Notification::assertSentTo($admin, LicenseExpiringNotification::class);
    }

    public function test_license_reminder_is_silent_outside_thresholds(): void
    {
        $this->seedRbac();
        Notification::fake();
        License::query()->update(['expires_at' => now()->addDays(3), 'grace_period_days' => 7]);
        $this->makeUser('admin');

        $this->artisan('licenses:send-reminders')->assertSuccessful();

        Notification::assertNothingSent();
    }

    public function test_subscription_reminder_notifies_client_by_email(): void
    {
        $this->seedRbac();
        Notification::fake();
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['email' => 'client@example.com']);
        $plan = SubscriptionPlan::create([
            'pressing_id' => $agency->pressing_id,
            'name' => 'Forfait test',
            'quota_type' => 'articles',
            'quota_amount' => 5,
            'price' => 5000,
            'duration_days' => 30,
            'is_active' => true,
        ]);

        CustomerSubscription::create([
            'client_id' => $client->id,
            'subscription_plan_id' => $plan->id,
            'agency_id' => $agency->id,
            'started_at' => now()->subDays(29),
            'expires_at' => now()->addDay()->endOfDay()->subSeconds(1),
            'quota_used' => 0,
            'status' => 'active',
        ]);

        $this->artisan('subscriptions:send-reminders')->assertSuccessful();

        Notification::assertSentOnDemand(SubscriptionExpiringNotification::class);
    }
}
