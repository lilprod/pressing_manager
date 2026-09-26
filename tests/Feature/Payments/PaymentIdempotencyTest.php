<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_replaying_the_same_webhook_does_not_double_charge(): void
    {
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create();

        $payment = Payment::create([
            'agency_id' => $agency->id,
            'client_id' => $client->id,
            'method' => 'flooz',
            'amount' => 5000,
            'currency' => 'XOF',
            'status' => 'en_attente',
            'external_reference' => 'flooz-ref-123',
        ]);

        $payload = ['reference' => 'flooz-ref-123', 'status' => 'success'];

        $first = $this->postJson('/api/webhooks/payments/flooz', $payload);
        $first->assertOk()->assertJson(['status' => 'complete']);

        $second = $this->postJson('/api/webhooks/payments/flooz', $payload);
        $second->assertOk()->assertJson(['status' => 'complete']);

        $this->assertSame(1, Payment::where('external_reference', 'flooz-ref-123')->count());
        $this->assertSame(5000, $payment->refresh()->amount);
    }

    public function test_a_webhook_for_an_unknown_reference_is_rejected(): void
    {
        $response = $this->postJson('/api/webhooks/payments/tmoney', [
            'reference' => 'unknown-ref',
            'status' => 'success',
        ]);

        $response->assertStatus(404);
    }

    public function test_an_unknown_payment_method_is_rejected(): void
    {
        $response = $this->postJson('/api/webhooks/payments/bitcoin', [
            'reference' => 'whatever',
            'status' => 'success',
        ]);

        $response->assertStatus(404);
    }
}
