<?php

namespace App\Http\Controllers\Api;

use App\Models\Invoice;
use App\Models\Order;
use App\Services\InvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class InvoiceController extends ApiController
{
    public function __construct(private readonly InvoiceService $invoices) {}

    public function storeForOrder(Request $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);
        $this->authorizePermission($request->user(), 'invoices.manage');

        if ($order->invoice()->exists()) {
            throw new HttpException(422, 'Cette commande a déjà une facture.');
        }

        $invoice = $this->invoices->createFromOrder($order);

        return response()->json($invoice, 201);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeAgency($request->user(), $invoice->agency_id);

        return response()->json($invoice->load('payments', 'order.items.service', 'client'));
    }

    public function downloadPdf(Request $request, Invoice $invoice): StreamedResponse
    {
        $this->authorizeAgency($request->user(), $invoice->agency_id);

        if ($invoice->pdf_path === null || ! Storage::disk(config('filesystems.default'))->exists($invoice->pdf_path)) {
            throw new HttpException(404, 'PDF introuvable pour cette facture.');
        }

        return Storage::disk(config('filesystems.default'))->response($invoice->pdf_path, "facture-{$invoice->invoice_number}.pdf");
    }
}
