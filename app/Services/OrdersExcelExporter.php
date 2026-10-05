<?php

namespace App\Services;

use App\Models\Order;
use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export Excel de la liste des dépôts (écran "Gestion des dépôts", bouton Exporter) —
 * même patron que CashLedgerExcelExporter/KpiExcelExporter (PhpSpreadsheet, déjà une
 * dépendance du projet).
 */
class OrdersExcelExporter
{
    private const HEADER_STYLE = [
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
    ];

    /**
     * @param  Collection<int, Order>  $orders
     */
    public function download(Collection $orders, string $agencyLabel): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Dépôts');

        $sheet->fromArray([
            ['Gestion des dépôts — Pressing Manager'],
            ["Agence : {$agencyLabel}"],
            ['Exporté le : '.now()->format('d/m/Y H:i')],
        ], null, 'A1');

        $headers = ['Code dépôt', 'Client', 'Téléphone', 'Articles', 'Total (FCFA)', 'Payé (FCFA)', 'Reste (FCFA)', 'Retrait prévu', 'État atelier'];
        $sheet->fromArray([$headers], null, 'A5');
        $sheet->getStyle('A5:I5')->applyFromArray(self::HEADER_STYLE);

        $row = 6;
        foreach ($orders as $order) {
            $articles = [];
            if ($order->pieces_count) {
                $articles[] = "{$order->pieces_count} pièce(s)";
            }
            if ($order->weight_kg_total) {
                $articles[] = "{$order->weight_kg_total} kg";
            }

            $sheet->fromArray([[
                $order->order_number_formatted ?? $order->order_number,
                trim(($order->client->first_name ?? '').' '.($order->client->last_name ?? '')),
                $order->client->phone ?? '',
                implode(' · ', $articles),
                $order->total_amount,
                $order->paid_amount ?? '',
                $order->balance_due ?? '',
                $order->promised_at?->format('d/m/Y H:i') ?? '',
                $order->status,
            ]], null, "A{$row}");
            $row++;
        }

        foreach (range('A', 'I') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $filename = 'depots-'.now()->format('Y-m-d').'.xlsx';

        return new StreamedResponse(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
