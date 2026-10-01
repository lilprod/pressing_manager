<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Service;
use App\Notifications\DocumentSentNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class DocumentTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeOrderWithItem(Agency $agency, ?string $clientEmail = 'aminata@example.com'): Order
    {
        $client = Client::factory()->for($agency, 'agency')->create(['email' => $clientEmail]);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'client_id' => $client->id]);
        $service = Service::factory()->create();
        OrderItem::factory()->create([
            'order_id' => $order->id,
            'agency_id' => $agency->id,
            'service_id' => $service->id,
        ]);

        return $order;
    }

    public function test_the_ticket_pdf_is_generated_on_the_fly(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrderWithItem($agency);

        $response = $this->actingAs($accueil)->get("/api/orders/{$order->id}/ticket-pdf");

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }

    public function test_the_ticket_pdf_requires_agency_access(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilB = $this->makeUser('accueil', $agencyB);
        $order = $this->makeOrderWithItem($agencyA);

        $response = $this->actingAs($accueilB)->get("/api/orders/{$order->id}/ticket-pdf");

        $response->assertStatus(403);
    }

    public function test_sending_the_ticket_by_email_notifies_the_client_and_logs_it(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrderWithItem($agency, 'aminata@example.com');

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/documents/ticket/send");

        $response->assertCreated();
        Notification::assertSentOnDemand(DocumentSentNotification::class);
        $this->assertDatabaseHas('notification_logs', [
            'order_id' => $order->id,
            'event' => 'document_sent',
            'channel' => 'mail',
            'recipient' => 'aminata@example.com',
            'status' => 'sent',
        ]);
    }

    public function test_sending_a_document_without_a_client_email_is_rejected(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrderWithItem($agency, null);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/documents/ticket/send");

        $response->assertStatus(422);
        Notification::assertNothingSent();
    }

    public function test_sending_the_invoice_without_one_generated_yet_is_rejected(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrderWithItem($agency);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/documents/invoice/send");

        $response->assertStatus(422);
        Notification::assertNothingSent();
    }

    public function test_sending_the_invoice_by_email_attaches_the_generated_pdf(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrderWithItem($agency);
        $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/invoice")->assertCreated();

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/documents/invoice/send");

        $response->assertCreated();
        Notification::assertSentOnDemand(DocumentSentNotification::class);
    }

    public function test_an_invalid_document_type_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = $this->makeOrderWithItem($agency);

        $response = $this->actingAs($accueil)->postJson("/api/orders/{$order->id}/documents/receipt/send");

        $response->assertStatus(404);
    }
}
