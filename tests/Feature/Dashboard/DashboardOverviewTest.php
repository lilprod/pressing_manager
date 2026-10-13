<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\LoyaltyPointMovement;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class DashboardOverviewTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeOrder(Agency $agency, array $attributes = []): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create();

        return Order::factory()->create(array_merge([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
        ], $attributes));
    }

    private function makeInvoice(Agency $agency, int $total, int $daysAgo): Invoice
    {
        $order = $this->makeOrder($agency);

        return Invoice::create([
            'agency_id' => $agency->id,
            'client_id' => $order->client_id,
            'order_id' => $order->id,
            'invoice_number' => random_int(1, 999999),
            'subtotal' => $total,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'total_amount' => $total,
            'status' => 'emise',
            'issued_at' => now()->subDays($daysAgo),
        ]);
    }

    public function test_overview_requires_reports_view(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->getJson('/api/dashboard/overview')->assertStatus(403);
    }

    public function test_pipeline_counts_orders_and_remaining_pieces_by_status(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $order = $this->makeOrder($agency, ['status' => 'en_traitement']);
        OrderItem::factory()->create(['order_id' => $order->id, 'status' => 'en_traitement', 'quantity' => 4]);
        OrderItem::factory()->create(['order_id' => $order->id, 'status' => 'en_traitement', 'quantity' => 3, 'quantity_delivered' => 1]);
        $cancelled = $this->makeOrder($agency, ['status' => 'annule']);
        OrderItem::factory()->create(['order_id' => $cancelled->id, 'status' => 'en_traitement', 'quantity' => 9]);

        $response = $this->actingAs($manager)->getJson('/api/dashboard/overview');

        $response->assertOk();
        $row = collect($response->json('pipeline'))->firstWhere('status', 'en_traitement');
        $this->assertSame(1, $row['orders']);
        $this->assertSame(6, $row['pieces']);
        $this->assertSame(7, $response->json('pieces_received'));
    }

    public function test_deadlines_detect_approaching_and_overdue_orders_in_progress_only(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $this->makeOrder($agency, ['status' => 'trie', 'promised_at' => now()->addHours(5)]);
        $this->makeOrder($agency, ['status' => 'recu', 'promised_at' => now()->subHours(3)]);
        $this->makeOrder($agency, ['status' => 'pret', 'promised_at' => now()->subHours(3)]); // déjà prêt : pas en retard atelier
        $this->makeOrder($agency, ['status' => 'recu', 'promised_at' => now()->addDays(3)]);

        $deadlines = $this->actingAs($manager)->getJson('/api/dashboard/overview')->json('deadlines');

        $this->assertSame(1, $deadlines['approaching_count']);
        $this->assertCount(1, $deadlines['approaching']);
        $this->assertSame(1, $deadlines['overdue_count']);
    }

    public function test_aging_buckets_unpaid_balances_by_issue_date(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $this->makeInvoice($agency, 1000, 5);
        $this->makeInvoice($agency, 2000, 45);
        $this->makeInvoice($agency, 4000, 120);

        $aging = $this->actingAs($manager)->getJson('/api/dashboard/overview')->json('aging');

        $this->assertSame(7000, $aging['total']);
        $this->assertSame(1000, $aging['buckets']['0_30']['amount']);
        $this->assertSame(2000, $aging['buckets']['31_89']['amount']);
        $this->assertSame(4000, $aging['buckets']['90_plus']['amount']);
    }

    public function test_loyalty_members_and_new_members_this_month(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $old = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 50]);
        LoyaltyPointMovement::create(['client_id' => $old->id, 'agency_id' => $agency->id, 'points' => 50, 'reason' => 'payment', 'created_at' => now()->subMonths(3)]);
        $new = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 10]);
        LoyaltyPointMovement::create(['client_id' => $new->id, 'agency_id' => $agency->id, 'points' => 10, 'reason' => 'payment', 'created_at' => now()]);
        Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 0]);

        $loyalty = $this->actingAs($manager)->getJson('/api/dashboard/overview')->json('loyalty');

        $this->assertSame(2, $loyalty['members']);
        $this->assertSame(1, $loyalty['new_this_month']);
    }

    public function test_overview_never_includes_another_agency_for_an_agency_user(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->makeInvoice($other, 9999, 5);

        $aging = $this->actingAs($manager)->getJson("/api/dashboard/overview?agency_id={$other->id}")->json('aging');

        $this->assertSame(0, $aging['total']);
    }
}
