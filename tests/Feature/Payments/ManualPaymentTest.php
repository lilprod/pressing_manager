<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Invoice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class ManualPaymentTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeInvoice(Agency $agency, Client $client, int $total = 2000): Invoice
    {
        return Invoice::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'invoice_number' => 1,
            'subtotal' => $total,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'total_amount' => $total,
            'status' => 'emise',
            'issued_at' => now(),
        ]);
    }

    public function test_a_mobile_money_payment_with_a_reference_settles_the_invoice_immediately(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $invoice = $this->makeInvoice($agency, $client, 2000);

        $response = $this->actingAs($accueil)->postJson('/api/payments/manual', [
            'client_id' => $client->id,
            'invoice_id' => $invoice->id,
            'amount' => 2000,
            'method' => 'flooz',
            'reference' => 'FLZ-REF-998877',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', 'complete');
        $response->assertJsonPath('method', 'flooz');
        $response->assertJsonPath('external_reference', 'FLZ-REF-998877');
        $this->assertSame('payee', $invoice->refresh()->status);
    }

    public function test_a_card_payment_without_a_reference_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $invoice = $this->makeInvoice($agency, $client, 2000);

        $response = $this->actingAs($accueil)->postJson('/api/payments/manual', [
            'client_id' => $client->id,
            'invoice_id' => $invoice->id,
            'amount' => 2000,
            'method' => 'carte',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('reference');
    }

    public function test_cash_is_not_an_accepted_method_on_this_endpoint(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $response = $this->actingAs($accueil)->postJson('/api/payments/manual', [
            'client_id' => $client->id,
            'amount' => 1000,
            'method' => 'espece',
            'reference' => 'whatever',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('method');
    }

    public function test_recording_a_manual_payment_requires_the_payments_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $response = $this->actingAs($technicien)->postJson('/api/payments/manual', [
            'client_id' => $client->id,
            'amount' => 1000,
            'method' => 'flooz',
            'reference' => 'FLZ-1',
        ]);

        $response->assertStatus(403);
    }

    public function test_a_partial_manual_payment_leaves_the_invoice_partially_paid(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        $invoice = $this->makeInvoice($agency, $client, 2000);

        $response = $this->actingAs($accueil)->postJson('/api/payments/manual', [
            'client_id' => $client->id,
            'invoice_id' => $invoice->id,
            'amount' => 800,
            'method' => 'tmoney',
            'reference' => 'TM-REF-1',
        ]);

        $response->assertCreated();
        $this->assertSame('partiellement_payee', $invoice->refresh()->status);
    }

    public function test_an_agency_scoped_user_cannot_supply_a_foreign_agency_id(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agencyA);
        $client = Client::factory()->for($agencyB, 'agency')->create();

        $response = $this->actingAs($accueil)->postJson('/api/payments/manual', [
            'agency_id' => $agencyB->id,
            'client_id' => $client->id,
            'amount' => 1000,
            'method' => 'flooz',
            'reference' => 'FLZ-2',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('agency_id');
    }
}
