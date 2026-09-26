<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Order;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class InvoiceService
{
    public function createFromOrder(Order $order): Invoice
    {
        return DB::transaction(function () use ($order) {
            $order->loadMissing('items.service', 'client', 'agency');

            $subtotal = $order->items->sum(fn ($item) => $item->quantity * $item->unit_price);
            $discount = $order->discount_amount;
            $total = max($subtotal - $discount, 0);

            // PostgreSQL interdit FOR UPDATE combiné à un agrégat : on verrouille la ligne
            // de l'agence elle-même pour sérialiser les créations concurrentes de factures.
            DB::table('agencies')->where('id', $order->agency_id)->lockForUpdate()->first();
            $invoiceNumber = Invoice::where('agency_id', $order->agency_id)->max('invoice_number');

            $invoice = Invoice::create([
                'agency_id' => $order->agency_id,
                'client_id' => $order->client_id,
                'order_id' => $order->id,
                'invoice_number' => ($invoiceNumber ?? 0) + 1,
                'subtotal' => $subtotal,
                'discount_amount' => $discount,
                'tax_amount' => 0,
                'total_amount' => $total,
                'status' => 'emise',
                'issued_at' => now(),
            ]);

            $invoice->pdf_path = $this->renderPdf($invoice->load('order.items.service', 'client', 'agency'));
            $invoice->save();

            return $invoice;
        });
    }

    private function renderPdf(Invoice $invoice): string
    {
        $pdf = Pdf::loadView('invoices.pdf', ['invoice' => $invoice]);
        $path = sprintf('invoices/%d/facture-%d-%d.pdf', $invoice->agency_id, $invoice->agency_id, $invoice->invoice_number);

        Storage::disk(config('filesystems.default'))->put($path, $pdf->output());

        return $path;
    }
}
