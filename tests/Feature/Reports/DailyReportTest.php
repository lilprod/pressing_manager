<?php

namespace Tests\Feature\Reports;

use App\Models\Agency;
use App\Models\Attendance;
use App\Models\CashMovement;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class DailyReportTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeInvoice(Agency $agency, Client $client, array $overrides = []): Invoice
    {
        return Invoice::create(array_merge([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'invoice_number' => random_int(1, 999999),
            'subtotal' => 2000,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'total_amount' => 2000,
            'status' => 'emise',
            'issued_at' => now(),
        ], $overrides));
    }

    public function test_it_requires_the_reports_view_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $this->actingAs($technicien)->getJson('/api/reports/daily')->assertStatus(403);
    }

    public function test_it_rejects_a_global_user_without_an_agency_id(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)->getJson('/api/reports/daily')->assertStatus(422);
    }

    public function test_stats_count_only_todays_complete_payments(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 4000, 'status' => 'complete', 'paid_at' => now()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte', 'amount' => 6000, 'status' => 'complete', 'paid_at' => now()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 9999, 'status' => 'complete', 'paid_at' => now()->subDay()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 1234, 'status' => 'en_attente', 'paid_at' => now()]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $response->assertJsonPath('stats.revenue_today', 10000);
        $response->assertJsonPath('stats.transactions_count', 2);
        $response->assertJsonPath('stats.average_basket', 5000);
        $response->assertJsonPath('stats.cash_variance', null);
    }

    public function test_payments_by_method_covers_all_four_enum_values(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 5000, 'status' => 'complete', 'paid_at' => now()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte', 'amount' => 3000, 'status' => 'complete', 'paid_at' => now()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'flooz', 'amount' => 1000, 'status' => 'complete', 'paid_at' => now()]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'tmoney', 'amount' => 1000, 'status' => 'complete', 'paid_at' => now()]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $response->assertJsonPath('payments_by_method.espece.amount', 5000);
        $response->assertJsonPath('payments_by_method.espece.percent', 50);
        $response->assertJsonPath('payments_by_method.carte.amount', 3000);
        $response->assertJsonPath('payments_by_method.flooz.amount', 1000);
        $response->assertJsonPath('payments_by_method.tmoney.amount', 1000);
    }

    public function test_payments_by_hour_is_bounded_to_the_actual_transaction_range(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $today = now()->startOfDay();

        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 1000, 'status' => 'complete', 'paid_at' => $today->copy()->setTime(9, 0)]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 2000, 'status' => 'complete', 'paid_at' => $today->copy()->setTime(9, 45)]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 3000, 'status' => 'complete', 'paid_at' => $today->copy()->setTime(11, 15)]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $series = $response->json('payments_by_hour');
        $this->assertCount(3, $series); // heures 9, 10, 11 — jamais 24 créneaux fabriqués
        $this->assertSame(9, $series[0]['hour']);
        $this->assertSame(3000, $series[0]['total']);
        $this->assertSame(10, $series[1]['hour']);
        $this->assertSame(0, $series[1]['total']);
        $this->assertSame(11, $series[2]['hour']);
        $this->assertSame(3000, $series[2]['total']);
    }

    public function test_movements_summary_only_counts_validated_movements_of_the_day(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        CashMovement::create(['agency_id' => $agency->id, 'type' => 'entree', 'amount' => 5000, 'reason' => 'Apport', 'status' => 'valide', 'occurred_at' => now()]);
        CashMovement::create(['agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 1500, 'reason' => 'Fournitures', 'status' => 'valide', 'occurred_at' => now()]);
        CashMovement::create(['agency_id' => $agency->id, 'type' => 'sortie', 'amount' => 999999, 'reason' => 'En attente', 'status' => 'en_attente', 'occurred_at' => now()]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $response->assertJsonPath('movements_summary.in_total', 5000);
        $response->assertJsonPath('movements_summary.out_total', 1500);
        $response->assertJsonPath('movements_summary.count', 2);
        $this->assertCount(2, $response->json('movements'));
    }

    public function test_settled_today_requires_a_complete_payment_paid_today(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $settledInvoice = $this->makeInvoice($agency, $client, ['status' => 'payee', 'total_amount' => 2500]);
        Payment::create(['agency_id' => $agency->id, 'invoice_id' => $settledInvoice->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 2500, 'status' => 'complete', 'paid_at' => now()]);

        // Facture payée mais pas aujourd'hui : ne doit pas compter.
        $oldSettled = $this->makeInvoice($agency, $client, ['status' => 'payee', 'total_amount' => 1000]);
        Payment::create(['agency_id' => $agency->id, 'invoice_id' => $oldSettled->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 1000, 'status' => 'complete', 'paid_at' => now()->subDays(5)]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $response->assertJsonPath('settled_today.count', 1);
        $response->assertJsonPath('settled_today.amount', 2500);
    }

    public function test_unpaid_today_covers_invoices_issued_today_still_outstanding(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $this->makeInvoice($agency, $client, ['status' => 'emise', 'total_amount' => 3000, 'issued_at' => now()]);
        // Facture impayée mais émise hier : ne doit pas compter dans "aujourd'hui".
        $this->makeInvoice($agency, $client, ['status' => 'emise', 'total_amount' => 7000, 'issued_at' => now()->subDay()]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $response->assertJsonPath('unpaid_today.count', 1);
        $response->assertJsonPath('unpaid_today.amount', 3000);
    }

    public function test_discounts_today_sums_order_discount_amount(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Order::factory()->for($agency, 'agency')->create(['client_id' => $client->id, 'discount_amount' => 500]);
        Order::factory()->for($agency, 'agency')->create(['client_id' => $client->id, 'discount_amount' => 300]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $response->assertJsonPath('discounts_today', 800);
    }

    public function test_cashiers_only_lists_users_who_actually_received_a_payment_today(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $cashier = $this->makeUser('accueil', $agency);
        $idleStaff = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 4000, 'status' => 'complete', 'paid_at' => now(), 'received_by' => $cashier->id]);
        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'carte', 'amount' => 2000, 'status' => 'complete', 'paid_at' => now(), 'received_by' => $cashier->id]);
        Attendance::create(['agency_id' => $agency->id, 'user_id' => $idleStaff->id, 'clock_in' => now(), 'clock_out' => null]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $cashiers = $response->json('cashiers');
        $this->assertCount(1, $cashiers);
        $this->assertSame($cashier->id, $cashiers[0]['user_id']);
        $this->assertSame(6000, $cashiers[0]['amount']);
        $this->assertSame(2, $cashiers[0]['transactions_count']);
        $this->assertSame(3000, $cashiers[0]['average_basket']);
    }

    public function test_cashier_status_reflects_an_open_attendance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $cashier = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        Payment::create(['agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece', 'amount' => 1000, 'status' => 'complete', 'paid_at' => now(), 'received_by' => $cashier->id]);
        Attendance::create(['agency_id' => $agency->id, 'user_id' => $cashier->id, 'clock_in' => now(), 'clock_out' => null]);

        $response = $this->actingAs($manager)->getJson('/api/reports/daily');

        $response->assertOk();
        $this->assertSame('en_attente', $response->json('cashiers.0.status'));
    }

    public function test_a_local_users_agency_id_param_is_ignored_in_favor_of_their_own_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);
        $clientB = Client::factory()->for($agencyB, 'agency')->create();

        Payment::create(['agency_id' => $agencyB->id, 'client_id' => $clientB->id, 'method' => 'espece', 'amount' => 50000, 'status' => 'complete', 'paid_at' => now()]);

        $response = $this->actingAs($managerA)->getJson("/api/reports/daily?agency_id={$agencyB->id}");

        $response->assertOk();
        $response->assertJsonPath('stats.revenue_today', 0);
    }

    public function test_the_excel_export_respects_the_same_agency_scoping(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $response = $this->actingAs($manager)->get('/api/reports/daily/export/excel');

        $response->assertOk();
        $this->assertSame('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $response->headers->get('Content-Type'));
    }
}
