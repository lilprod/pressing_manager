<?php

namespace Tests\Feature\Subscriptions;

use App\Models\Agency;
use App\Models\Client;
use App\Models\CustomerSubscription;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class CustomerSubscriptionTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makePlan(): SubscriptionPlan
    {
        return SubscriptionPlan::create([
            'agency_id' => null,
            'name' => 'Forfait test',
            'quota_type' => 'articles',
            'quota_amount' => 5,
            'price' => 10000,
            'duration_days' => 30,
            'is_active' => true,
        ]);
    }

    public function test_subscribing_a_client_creates_an_active_subscription_and_a_payment(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $plan = $this->makePlan();

        $response = $this->actingAs($accueil)->postJson('/api/customer-subscriptions', [
            'client_id' => $client->id,
            'subscription_plan_id' => $plan->id,
            'method' => 'espece',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', 'active');
        $response->assertJsonPath('quota_used', 0);
        $this->assertDatabaseHas('customer_subscription_payments', [
            'customer_subscription_id' => $response->json('id'),
            'amount' => 10000,
            'method' => 'espece',
        ]);
    }

    public function test_creating_an_order_consumes_the_active_subscription_quota(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $plan = $this->makePlan();
        $service = Service::factory()->create(['base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $subscription = CustomerSubscription::create([
            'client_id' => $client->id,
            'subscription_plan_id' => $plan->id,
            'agency_id' => $agency->id,
            'started_at' => now(),
            'expires_at' => now()->addDays(30),
            'quota_used' => 0,
            'status' => 'active',
        ]);

        $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 3],
            ],
        ])->assertCreated();

        $this->assertSame(3, $subscription->fresh()->quota_used);
    }

    public function test_renewing_a_subscription_resets_quota_and_extends_expiry(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $plan = $this->makePlan();

        $subscription = CustomerSubscription::create([
            'client_id' => $client->id,
            'subscription_plan_id' => $plan->id,
            'agency_id' => $agency->id,
            'started_at' => now()->subDays(35),
            'expires_at' => now()->subDays(5),
            'quota_used' => 5,
            'status' => 'expired',
        ]);

        $response = $this->actingAs($accueil)->postJson("/api/customer-subscriptions/{$subscription->id}/renew", [
            'method' => 'tmoney',
            'external_reference' => 'TM-TEST-1',
        ]);

        $response->assertOk();
        $response->assertJsonPath('status', 'active');
        $response->assertJsonPath('quota_used', 0);
        $this->assertTrue(now()->parse($response->json('expires_at'))->isFuture());
    }

    public function test_expire_command_flips_overdue_active_subscriptions(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create();
        $plan = $this->makePlan();

        $subscription = CustomerSubscription::create([
            'client_id' => $client->id,
            'subscription_plan_id' => $plan->id,
            'agency_id' => $agency->id,
            'started_at' => now()->subDays(40),
            'expires_at' => now()->subDay(),
            'quota_used' => 0,
            'status' => 'active',
        ]);

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('expired', $subscription->fresh()->status);
    }
}
