<?php

namespace Tests\Feature\MultiAgency;

use App\Models\Agency;
use App\Models\Attendance;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderPickup;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class MultiAgencyTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makePayment(Agency $agency, int $amount, ?Client $client = null): Payment
    {
        return Payment::create([
            'agency_id' => $agency->id,
            'client_id' => ($client ?? Client::factory()->create(['agency_id' => $agency->id]))->id,
            'method' => 'espece',
            'amount' => $amount,
            'status' => 'complete',
            'paid_at' => now(),
        ]);
    }

    public function test_the_overview_requires_the_reports_view_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->getJson('/api/multi-agencies')->assertStatus(403);
    }

    public function test_a_global_admin_sees_every_agency_in_the_network_overview(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create(['name' => 'Pressing Centre']);
        $agencyB = Agency::factory()->create(['name' => 'Pressing Périphérie']);
        $admin = $this->makeUser('admin');

        $this->makePayment($agencyA, 5000);
        $this->makePayment($agencyB, 2000);
        Order::factory()->create(['agency_id' => $agencyA->id, 'client_id' => Client::factory()->create(['agency_id' => $agencyA->id])]);
        Order::factory()->create(['agency_id' => $agencyB->id, 'client_id' => Client::factory()->create(['agency_id' => $agencyB->id])]);

        $response = $this->actingAs($admin)->getJson('/api/multi-agencies');

        $response->assertOk();
        $rows = collect($response->json('agencies'));
        $this->assertTrue($rows->contains('id', $agencyA->id));
        $this->assertTrue($rows->contains('id', $agencyB->id));
        $this->assertSame(5000, $rows->firstWhere('id', $agencyA->id)['revenue']);
        $this->assertSame(2000, $rows->firstWhere('id', $agencyB->id)['revenue']);
        $this->assertSame(1, $rows->firstWhere('id', $agencyA->id)['deposits']);
        $this->assertSame(1, $rows->firstWhere('id', $agencyB->id)['deposits']);
    }

    public function test_an_agency_scoped_manager_only_sees_their_own_agency_in_the_overview(): void
    {
        $this->seedRbac();
        $mine = Agency::factory()->create();
        $other = Agency::factory()->create();
        $manager = $this->makeUser('manager', $mine);

        $this->makePayment($mine, 5000);
        $this->makePayment($other, 9000);

        $response = $this->actingAs($manager)->getJson('/api/multi-agencies');

        $response->assertOk();
        $response->assertJsonCount(1, 'agencies');
        $response->assertJsonPath('agencies.0.id', $mine->id);
        $response->assertJsonPath('network.revenue', 5000);
    }

    public function test_the_overview_computes_outstanding_pickups_late_orders_and_loyalty(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $client = Client::factory()->create(['agency_id' => $agency->id, 'loyalty_points' => 500]);
        $invoice = Invoice::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'invoice_number' => 1,
            'subtotal' => 10000,
            'total_amount' => 10000,
            'status' => 'emise',
            'issued_at' => now(),
        ]);
        // Facture impayée : aucun paiement complet rattaché -> reste dû = total_amount.

        $lateOrder = Order::factory()->create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'status' => 'en_traitement',
            'promised_at' => now()->subDay(),
        ]);
        $pickedUpOrder = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        OrderPickup::create([
            'order_id' => $pickedUpOrder->id,
            'agency_id' => $agency->id,
            'recipient_type' => 'client',
            'recipient_name' => $client->first_name.' '.$client->last_name,
            'processed_at' => now(),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/multi-agencies');

        $response->assertOk();
        $row = collect($response->json('agencies'))->firstWhere('id', $agency->id);
        $this->assertSame(10000, $row['outstanding']);
        $this->assertSame(1, $row['unpaid_clients']);
        $this->assertSame(1, $row['pickups']);
        $this->assertSame(1, $row['late_orders']);
        $this->assertSame(1, $row['loyalty_members']);
        $this->assertSame(500, $row['loyalty_points']);
    }

    public function test_the_overview_includes_an_alert_for_a_late_order(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        Order::factory()->create(['agency_id' => $agency->id, 'status' => 'recu', 'promised_at' => now()->subHours(5)]);

        $response = $this->actingAs($admin)->getJson('/api/multi-agencies');

        $alerts = collect($response->json('alerts'));
        $this->assertTrue($alerts->contains(fn ($a) => $a['agency_id'] === $agency->id && $a['kind'] === 'late'));
    }

    public function test_the_revenue_series_covers_every_day_of_the_range_with_zeroes(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $this->makePayment($agency, 1000);

        $response = $this->actingAs($admin)->getJson('/api/multi-agencies?from='.now()->subDays(2)->toDateString().'&to='.now()->toDateString());

        $response->assertOk();
        $series = $response->json('revenue_series');
        $this->assertCount(3, $series);
        $this->assertSame(1000, collect($series)->firstWhere('date', now()->toDateString())['revenue']);
    }

    public function test_the_agency_detail_endpoint_requires_access_to_that_agency(): void
    {
        $this->seedRbac();
        $mine = Agency::factory()->create();
        $other = Agency::factory()->create();
        $manager = $this->makeUser('manager', $mine);

        $this->actingAs($manager)->getJson("/api/multi-agencies/{$other->id}")->assertStatus(403);
    }

    public function test_the_agency_detail_endpoint_includes_network_comparison_for_a_global_admin(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $this->makePayment($agencyA, 5000);
        $this->makePayment($agencyB, 1000);

        $response = $this->actingAs($admin)->getJson("/api/multi-agencies/{$agencyA->id}");

        $response->assertOk();
        $response->assertJsonPath('kpis.revenue', 5000);
        $response->assertJsonPath('network_comparison.agency_count', 2);
        $response->assertJsonPath('network_comparison.rank', 1);
    }

    public function test_the_agency_detail_endpoint_omits_network_comparison_for_an_agency_scoped_manager(): void
    {
        // Un manager local ne doit jamais recevoir d'agrégat calculé sur les autres agences.
        $this->seedRbac();
        $mine = Agency::factory()->create();
        Agency::factory()->create();
        $manager = $this->makeUser('manager', $mine);

        $response = $this->actingAs($manager)->getJson("/api/multi-agencies/{$mine->id}");

        $response->assertOk();
        $response->assertJsonPath('network_comparison', null);
    }

    public function test_the_agency_detail_endpoint_reports_the_workshop_breakdown(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        Order::factory()->create(['agency_id' => $agency->id, 'status' => 'recu']);
        Order::factory()->create(['agency_id' => $agency->id, 'status' => 'en_traitement']);
        Order::factory()->create(['agency_id' => $agency->id, 'status' => 'pret']);

        $response = $this->actingAs($admin)->getJson("/api/multi-agencies/{$agency->id}");

        $response->assertOk();
        $response->assertJsonPath('workshop.columns.attente', 1);
        $response->assertJsonPath('workshop.columns.cours', 1);
        $response->assertJsonPath('workshop.columns.classes', 1);
        $response->assertJsonPath('workshop.active_count', 3);
    }

    public function test_the_agency_detail_endpoint_lists_currently_clocked_in_staff(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $technicien = $this->makeUser('technicien', $agency);

        Attendance::create([
            'agency_id' => $agency->id,
            'user_id' => $technicien->id,
            'clock_in' => now()->subHours(2),
            'clock_out' => null,
            'status' => 'present',
        ]);
        // Pointage déjà clôturé aujourd'hui : ne doit pas apparaître comme "présent".
        $otherStaff = User::factory()->create(['agency_id' => $agency->id]);
        Attendance::create([
            'agency_id' => $agency->id,
            'user_id' => $otherStaff->id,
            'clock_in' => now()->subHours(4),
            'clock_out' => now()->subHour(),
            'status' => 'present',
        ]);

        $response = $this->actingAs($admin)->getJson("/api/multi-agencies/{$agency->id}");

        $response->assertOk();
        $present = $response->json('team_present');
        $this->assertCount(1, $present);
        $this->assertSame($technicien->id, $present[0]['user']['id']);
    }

    public function test_the_agency_detail_endpoint_surfaces_recent_audit_activity(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        // Order utilise le trait Auditable : sa création journalise automatiquement une entrée.
        Order::factory()->create(['agency_id' => $agency->id]);

        $response = $this->actingAs($admin)->getJson("/api/multi-agencies/{$agency->id}");

        $response->assertOk();
        $this->assertNotEmpty($response->json('recent_activity'));
        $this->assertSame('Order', $response->json('recent_activity.0.auditable_type'));
    }

    public function test_cash_flow_net_excludes_pending_cash_movements(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'entree', 'category' => 'autre',
            'amount' => 2000, 'reason' => 'Fonds de caisse', 'status' => 'valide', 'occurred_at' => now(),
        ]);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'fourniture',
            'amount' => 500, 'reason' => 'Achat produits', 'status' => 'valide', 'occurred_at' => now(),
        ]);
        CashMovement::create([
            'agency_id' => $agency->id, 'type' => 'sortie', 'category' => 'autre',
            'amount' => 9999, 'reason' => 'Mouvement sensible non validé', 'status' => 'en_attente', 'occurred_at' => now(),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/multi-agencies');

        $response->assertOk();
        $row = collect($response->json('agencies'))->firstWhere('id', $agency->id);
        $this->assertSame(1500, $row['cash_flow_net']);
    }
}
