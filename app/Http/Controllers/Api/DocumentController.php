<?php

namespace App\Http\Controllers\Api;

use App\Models\NotificationLog;
use App\Models\Order;
use App\Notifications\DocumentSentNotification;
use App\Services\TicketPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Écran « Ticket et facture » (Figma SPARK PRESSING) : aperçu/impression/envoi des documents d'un dépôt. */
class DocumentController extends ApiController
{
    public function __construct(private readonly TicketPdfService $tickets) {}

    /** PDF du ticket généré à la volée (voir TicketPdfService — jamais stocké). */
    public function ticketPdf(Request $request, Order $order): Response
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        $pdf = $this->tickets->render($order);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "inline; filename=ticket-{$order->order_number}.pdf",
        ]);
    }

    /** Envoie le ticket ou la facture par e-mail au client (seul canal réellement livrable — pas de passerelle SMS/WhatsApp réelle). */
    public function send(Request $request, Order $order, string $type): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);
        $this->authorizePermission($request->user(), 'orders.manage');

        if (! in_array($type, ['ticket', 'invoice'], true)) {
            throw new HttpException(404);
        }

        $order->loadMissing('client', 'invoice');
        $client = $order->client;

        if (! $client->email) {
            throw new HttpException(422, "Ce client n'a pas d'adresse e-mail enregistrée.");
        }

        if ($type === 'invoice') {
            $invoice = $order->invoice->first();
            if ($invoice === null || $invoice->pdf_path === null) {
                throw new HttpException(422, 'Aucune facture générée pour ce dépôt.');
            }
            $notification = new DocumentSentNotification(
                $order,
                'invoice',
                "facture-{$invoice->invoice_number}.pdf",
                pdfAttachmentDisk: config('filesystems.default'),
                pdfAttachmentPath: $invoice->pdf_path,
            );
        } else {
            $notification = new DocumentSentNotification(
                $order,
                'ticket',
                "ticket-{$order->order_number}.pdf",
                pdfAttachmentData: $this->tickets->render($order),
            );
        }

        Notification::route('mail', $client->email)->notify($notification);

        $log = NotificationLog::create([
            'agency_id' => $order->agency_id,
            'client_id' => $client->id,
            'order_id' => $order->id,
            'event' => 'document_sent',
            'channel' => 'mail',
            'recipient' => $client->email,
            'message' => $notification->summary(),
            'status' => 'sent',
            'sent_at' => now(),
        ]);

        return response()->json($log, 201);
    }
}
