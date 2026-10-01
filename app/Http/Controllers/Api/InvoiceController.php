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

    /** Liste des factures non soldées (émises ou partiellement payées), avec le solde restant dû. */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'invoices.manage');
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $baseQuery = Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->withSum(['payments as paid_amount' => fn ($query) => $query->where('status', 'complete')], 'amount');

        // Calculé sur l'ensemble des factures impayées correspondant aux filtres, pas
        // seulement la page affichée : sinon ce total serait faux dès qu'il y a plus
        // d'une page de résultats.
        $totalOutstanding = (clone $baseQuery)->get()
            ->sum(fn (Invoice $invoice) => $invoice->total_amount - (int) ($invoice->paid_amount ?? 0));

        $invoices = $baseQuery->with('client')
            ->oldest('issued_at')
            ->paginate($request->integer('per_page', 20));

        $invoices->getCollection()->transform(function (Invoice $invoice) {
            $invoice->balance_due = $invoice->total_amount - (int) ($invoice->paid_amount ?? 0);

            return $invoice;
        });

        return response()->json([
            ...$invoices->toArray(),
            'total_outstanding' => $totalOutstanding,
        ]);
    }

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

        return response()->json($invoice->load('payments', 'order.items.service', 'order.items.treatmentType', 'client'));
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
