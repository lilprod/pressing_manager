<?php

namespace Tests\Feature\Invoices;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class OutstandingInvoicesTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeInvoice(Agency $agency, Client $client, int $number, string $status, int $total = 2000): Invoice
    {
        return Invoice::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'invoice_number' => $number,
            'subtotal' => $total,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'total_amount' => $total,
            'status' => $status,
            'issued_at' => now(),
        ]);
    }

    public function test_an_unpaid_invoice_is_listed_with_its_full_balance_due(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $invoice = $this->makeInvoice($agency, $client, 1, 'emise', 2000);

        $response = $this->actingAs($accueil)->getJson('/api/invoices');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $response->assertJsonPath('data.0.id', $invoice->id);
        $response->assertJsonPath('data.0.balance_due', 2000);
    }

    public function test_a_partially_paid_invoice_is_listed_with_the_remaining_balance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $invoice = $this->makeInvoice($agency, $client, 1, 'partiellement_payee', 2000);
        Payment::create([
            'agency_id' => $agency->id,
            'invoice_id' => $invoice->id,
            'client_id' => $client->id,
            'method' => 'espece',
            'amount' => 800,
            'currency' => 'XOF',
            'status' => 'complete',
            'paid_at' => now(),
        ]);
        // Un paiement en attente ne doit pas réduire le solde affiché.
        Payment::create([
            'agency_id' => $agency->id,
            'invoice_id' => $invoice->id,
            'client_id' => $client->id,
            'method' => 'flooz',
            'amount' => 500,
            'currency' => 'XOF',
            'status' => 'en_attente',
        ]);

        $response = $this->actingAs($accueil)->getJson('/api/invoices');

        $response->assertOk();
        $response->assertJsonPath('data.0.balance_due', 1200);
    }

    public function test_fully_paid_cancelled_and_draft_invoices_are_excluded(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $this->makeInvoice($agency, $client, 1, 'payee');
        $this->makeInvoice($agency, $client, 2, 'annulee');
        $this->makeInvoice($agency, $client, 3, 'brouillon');

        $response = $this->actingAs($accueil)->getJson('/api/invoices');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    public function test_the_outstanding_invoices_list_is_scoped_to_the_users_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $clientA = Client::factory()->for($agencyA, 'agency')->create();
        $clientB = Client::factory()->for($agencyB, 'agency')->create();
        $this->makeInvoice($agencyA, $clientA, 1, 'emise');
        $this->makeInvoice($agencyB, $clientB, 1, 'emise');

        $response = $this->actingAs($accueilA)->getJson('/api/invoices');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_the_total_outstanding_covers_every_matching_invoice_not_just_the_current_page(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        for ($i = 1; $i <= 25; $i++) {
            $this->makeInvoice($agency, $client, $i, 'emise', 1000);
        }

        $response = $this->actingAs($accueil)->getJson('/api/invoices?per_page=20');

        $response->assertOk();
        $this->assertCount(20, $response->json('data'));
        $response->assertJsonPath('total_outstanding', 25000);
    }

    public function test_listing_outstanding_invoices_requires_the_invoices_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->getJson('/api/invoices');

        $response->assertStatus(403);
    }
}
