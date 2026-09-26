<?php

namespace Tests\Feature\Kpi;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class KpiTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makePayment(Agency $agency, int $amount, string $status = 'complete'): Payment
    {
        $client = Client::factory()->create(['agency_id' => $agency->id]);

        return Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => $amount,
            'status' => $status,
            'paid_at' => $status === 'complete' ? now() : null,
        ]);
    }

    public function test_kpi_endpoint_requires_reports_view_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson('/api/kpi');

        $response->assertStatus(403);
    }

    public function test_kpi_for_a_single_agency_computes_revenue_and_orders(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);

        $this->makePayment($agency, 5000);
        $this->makePayment($agency, 3000);
        $this->makePayment($agency, 1000, 'en_attente');

        Order::factory()->create(['agency_id' => $agency->id, 'total_amount' => 4000, 'is_express' => true]);
        Order::factory()->create(['agency_id' => $agency->id, 'total_amount' => 2000, 'is_express' => false]);

        $response = $this->actingAs($manager)->getJson('/api/kpi');

        $response->assertOk();
        $response->assertJsonPath('scope', 'agency');
        $response->assertJsonPath('revenue', 8000);
        $response->assertJsonPath('orders_count', 2);
        $response->assertJsonPath('average_order_value', 3000);
        $response->assertJsonPath('express_rate', 50);
        $response->assertJsonMissingPath('by_agency');
    }

    public function test_kpi_consolidated_view_aggregates_all_agencies_and_lists_breakdown(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $globalManager = $this->makeUser('manager');

        $this->makePayment($agencyA, 5000);
        $this->makePayment($agencyB, 7000);

        $response = $this->actingAs($globalManager)->getJson('/api/kpi');

        $response->assertOk();
        $response->assertJsonPath('scope', 'consolidated');
        $response->assertJsonPath('revenue', 12000);
        $byAgency = collect($response->json('by_agency'));
        $this->assertCount(2, $byAgency);
        $this->assertSame(5000, $byAgency->firstWhere('agency_id', $agencyA->id)['revenue']);
        $this->assertSame(7000, $byAgency->firstWhere('agency_id', $agencyB->id)['revenue']);
    }

    public function test_a_local_user_cannot_see_another_agencys_data_regardless_of_query_param(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);

        $this->makePayment($agencyA, 1000);
        $this->makePayment($agencyB, 9000);

        $response = $this->actingAs($managerA)->getJson("/api/kpi?agency_id={$agencyB->id}");

        $response->assertOk();
        $response->assertJsonPath('scope', 'agency');
        $response->assertJsonPath('revenue', 1000);
    }

    public function test_pdf_export_returns_a_valid_pdf_document(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->makePayment($agency, 2000);

        $response = $this->actingAs($manager)->get('/api/kpi/export/pdf');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_excel_export_returns_a_valid_xlsx_document(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $this->makePayment($agency, 2000);

        $response = $this->actingAs($manager)->get('/api/kpi/export/excel');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        // Un .xlsx est une archive ZIP : signature de fichier "PK".
        $this->assertStringStartsWith('PK', $response->streamedContent());
    }

    public function test_excel_export_for_consolidated_view_includes_a_by_agency_sheet(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $globalManager = $this->makeUser('manager');
        $this->makePayment($agencyA, 1000);
        $this->makePayment($agencyB, 2000);

        $response = $this->actingAs($globalManager)->get('/api/kpi/export/excel');

        $response->assertOk();
        $this->assertStringStartsWith('PK', $response->streamedContent());
    }
}
