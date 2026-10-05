<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export Excel du journal de caisse (écran "Centre de caisse", bouton Exporter) — même
 * patron que KpiExcelExporter (déjà une dépendance du projet, PhpSpreadsheet).
 */
class CashLedgerExcelExporter
{
    private const HEADER_STYLE = [
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
    ];

    private const KIND_LABELS = ['mouvement' => 'Mouvement', 'encaissement' => 'Encaissement', 'cloture' => 'Clôture'];

    /**
     * @param  array<int,object>  $rows
     */
    public function download(array $rows, string $agencyName, string $from, string $to): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Journal de caisse');

        $sheet->fromArray([
            ['Journal de caisse — Pressing Manager'],
            ["Agence : {$agencyName}"],
            ["Période : {$from} au {$to}"],
        ], null, 'A1');

        $headers = ['Date', 'Type', 'Référence', 'Catégorie', 'Agent', 'Montant (FCFA)', 'Statut'];
        $sheet->fromArray([$headers], null, 'A5');
        $sheet->getStyle('A5:G5')->applyFromArray(self::HEADER_STYLE);

        $row = 6;
        foreach ($rows as $entry) {
            $amount = (int) $entry->amount * ($entry->direction === '-' ? -1 : 1);
            $sheet->fromArray([[
                $entry->date,
                self::KIND_LABELS[$entry->kind] ?? $entry->kind,
                $entry->reference,
                $entry->category,
                $entry->agent_name,
                $amount,
                $entry->status,
            ]], null, "A{$row}");
            $row++;
        }

        foreach (range('A', 'G') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $filename = "journal-caisse-{$from}-{$to}.xlsx";

        return new StreamedResponse(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
