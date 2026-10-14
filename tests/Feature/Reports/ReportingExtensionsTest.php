<?php

namespace Tests\Feature\Reports;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\CashSession;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\ReportSchedule;
use App\Notifications\ScheduledReportNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class ReportingExtensionsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function invoiceFor(Agency $agency, int $total): Invoice
    {
        $client = Client::factory()->for($agency, 'agency')->create();
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'total_amount' => $total]);

        return Invoice::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'order_id' => $order->id, 'invoice_number' => random_int(1, 999999),
            'subtotal' => $total, 'discount_amount' => 0, 'tax_amount' => 0, 'total_amount' => $total, 'status' => 'emise', 'issued_at' => now(),
        ]);
    }

    public function test_my_session_is_a_real_json_null_when_no_session_is_open(): void
    {
        $this->seedRbac();
        $cashier = $this->makeUser('accueil', Agency::factory()->create());

        $response = $this->actingAs($cashier)->getJson('/api/cash/sessions/mine')->assertOk();
        // `{}` serait vrai côté client et afficherait une session fantôme.
        $this->assertSame('null', $response->getContent());
    }

    public function test_cash_session_lifecycle_links_payments_and_computes_variance(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $cashier = $this->makeUser('accueil', $agency);

        $session = $this->actingAs($cashier)->postJson('/api/cash/sessions', ['register_label' => 'Caisse 01', 'opening_float' => 10000])->assertCreated()->json();
        $this->actingAs($cashier)->postJson('/api/cash/sessions', ['register_label' => 'Caisse 02', 'opening_float' => 0])->assertStatus(422);

        $invoice = $this->invoiceFor($agency, 5000);
        $this->actingAs($cashier)->postJson('/api/payments/cash', ['invoice_id' => $invoice->id, 'client_id' => $invoice->client_id, 'amount' => 5000])->assertSuccessful();

        $this->actingAs($cashier)->postJson("/api/cash/sessions/{$session['id']}/close", ['counted_amount' => 14000])->assertStatus(422); // écart sans commentaire
        $closed = $this->actingAs($cashier)->postJson("/api/cash/sessions/{$session['id']}/close", ['counted_amount' => 14000, 'notes' => 'Monnaie rendue en trop'])->assertOk()->json();

        $this->assertSame(15000, $closed['expected_amount']);
        $this->assertSame(-1000, $closed['variance']);
        $this->assertSame(5000, $closed['collected_total']);
    }

    public function test_daily_report_includes_sessions_reconciliation_discounts_and_targets(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        AgencySetting::forAgency($agency->id)->update(['cashier_daily_target' => 50000]);
        CashSession::create(['agency_id' => $agency->id, 'user_id' => $manager->id, 'register_label' => 'Caisse 01', 'opening_float' => 0, 'opened_at' => now(), 'status' => 'open']);
        $client = Client::factory()->for($agency, 'agency')->create();
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'total_amount' => 800, 'discount_amount' => 200]);
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'total_amount' => 9500, 'discount_amount' => 500]);

        $report = $this->actingAs($manager)->getJson("/api/reports/daily?agency_id={$agency->id}")->assertOk()->json();

        $this->assertCount(1, $report['sessions']);
        $this->assertSame(50000, $report['cashier_daily_target']);
        $this->assertSame(2, $report['discounts']['count']);
        $this->assertSame(1, $report['discounts']['sensitive_count']);
        $this->assertFalse($report['reconciliation']['closed']);
        $this->assertArrayHasKey('revenue_previous', $report['comparison']);

        $this->actingAs($manager)->get("/api/reports/daily/export/pdf?agency_id={$agency->id}")->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_kpi_exposes_extended_metrics_series_and_csv(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id, 'total_amount' => 3000, 'discount_amount' => 300]);

        $kpi = $this->actingAs($manager)->getJson('/api/kpi?from='.now()->toDateString().'&to='.now()->toDateString())->assertOk()->json();
        $this->assertSame(300, $kpi['discounts_total']);
        $this->assertArrayHasKey('pickups_count', $kpi);
        $this->assertArrayHasKey('outstanding', $kpi);

        $series = $this->actingAs($manager)->getJson('/api/kpi/revenue-series?from='.now()->toDateString().'&to='.now()->toDateString())->json('series');
        $this->assertSame(1, $series[0]['orders']);
        $this->assertSame(3000, $series[0]['average_basket']);

        $this->actingAs($manager)->get('/api/kpi/export/csv?from='.now()->toDateString().'&to='.now()->toDateString())->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    }

    public function test_report_schedules_are_sent_when_due(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $this->actingAs($manager)->postJson('/api/report-schedules', ['frequency' => 'daily', 'format' => 'csv', 'recipients' => ['direction@example.test']])->assertCreated();
        $this->assertSame($agency->id, ReportSchedule::first()->agency_id);

        $this->artisan('reports:send-scheduled')->assertSuccessful();
        Notification::assertSentOnDemand(ScheduledReportNotification::class);
        $this->assertNotNull(ReportSchedule::first()->last_sent_at);

        // Pas de second envoi le même jour.
        $this->artisan('reports:send-scheduled')->assertSuccessful();
        Notification::assertSentOnDemandTimes(ScheduledReportNotification::class, 1);
    }
}
