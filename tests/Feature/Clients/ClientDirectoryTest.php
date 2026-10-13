<?php

namespace Tests\Feature\Clients;

use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyTier;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class ClientDirectoryTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function tiers(Agency $agency): array
    {
        $essentiel = LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Essentiel', 'min_spend_amount' => 0, 'discount_rate' => 0, 'is_active' => true]);
        $or = LoyaltyTier::create(['pressing_id' => $agency->pressing_id, 'name' => 'Or', 'min_spend_amount' => 100000, 'discount_rate' => 5, 'is_active' => true]);

        return [$essentiel, $or];
    }

    public function test_metrics_expose_code_last_order_frequency_and_lifetime_value(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['created_at' => now()->subYears(2)]);
        Order::factory()->count(3)->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 7000, 'status' => 'complete', 'paid_at' => now()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 9999, 'status' => 'en_attente', 'paid_at' => now()]);

        $row = $this->actingAs($manager)->getJson('/api/clients?with_metrics=1')->assertOk()->json('data.0');

        $this->assertSame('CLI-'.str_pad((string) $client->id, 5, '0', STR_PAD_LEFT), $row['client_code']);
        $this->assertSame(7000, $row['lifetime_value']);
        $this->assertEquals(0.3, $row['orders_per_month']); // 3 dépôts / 12 mois
        $this->assertNotNull($row['last_order_at']);
        $this->assertSame($agency->name, $row['agency']['name']);
    }

    public function test_tier_filter_uses_spend_bounds_of_the_tier(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        [, $or] = $this->tiers($agency);
        Client::factory()->for($agency, 'agency')->create(['last_name' => 'Petit', 'loyalty_spend_12m' => 5000]);
        Client::factory()->for($agency, 'agency')->create(['last_name' => 'Grand', 'loyalty_spend_12m' => 150000]);

        $names = collect($this->actingAs($manager)->getJson("/api/clients?tier_id={$or->id}")->json('data'))->pluck('last_name');

        $this->assertSame(['Grand'], $names->all());
    }

    public function test_search_by_client_code_and_activity_filter(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $target = Client::factory()->for($agency, 'agency')->create();
        Client::factory()->for($agency, 'agency')->create();
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $target->id]);

        $byCode = $this->actingAs($manager)->getJson('/api/clients?search=CLI-'.str_pad((string) $target->id, 5, '0', STR_PAD_LEFT))->json('data');
        $active = $this->actingAs($manager)->getJson('/api/clients?activity=today')->json('data');

        $this->assertSame([$target->id], collect($byCode)->pluck('id')->all());
        $this->assertSame([$target->id], collect($active)->pluck('id')->all());
    }

    public function test_stats_include_tier_distribution_and_monthly_points(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->tiers($agency);
        Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 150000, 'created_at' => now()]);

        $stats = $this->actingAs($manager)->getJson('/api/clients/stats')->assertOk()->json();

        $this->assertCount(2, $stats['by_tier']);
        $this->assertSame(1, collect($stats['by_tier'])->firstWhere('name', 'Or')['count']);
        $this->assertSame(1, $stats['new_this_week']);
        $this->assertArrayHasKey('points_issued_this_month', $stats);
    }

    public function test_export_returns_an_xlsx_file(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        Client::factory()->for($agency, 'agency')->create();

        $response = $this->actingAs($manager)->get('/api/clients/export');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_detail_exposes_loyalty_progress_and_internal_notes(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->tiers($agency);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 40000, 'loyalty_points' => 120]);

        $loyalty = $this->actingAs($manager)->getJson("/api/clients/{$client->id}")->assertOk()->json('loyalty');
        $this->assertSame('Essentiel', $loyalty['current_tier']['name']);
        $this->assertSame('Or', $loyalty['next_tier']['name']);
        $this->assertSame(60000, $loyalty['next_tier']['remaining']);
        $this->assertSame(40, $loyalty['progress']);

        $this->actingAs($manager)->postJson("/api/clients/{$client->id}/notes", ['body' => 'Boutons nacrés fragiles'])->assertCreated();
        $notes = $this->actingAs($manager)->getJson("/api/clients/{$client->id}/notes")->assertOk()->json();
        $this->assertSame('Boutons nacrés fragiles', $notes[0]['body']);
        $this->assertSame($manager->name, $notes[0]['author']['name']);
    }

    public function test_notes_of_another_agency_client_are_forbidden(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $foreign = Client::factory()->for($other, 'agency')->create();

        $this->actingAs($manager)->getJson("/api/clients/{$foreign->id}/notes")->assertForbidden();
        $this->actingAs($manager)->postJson("/api/clients/{$foreign->id}/notes", ['body' => 'x'])->assertForbidden();
    }
}
