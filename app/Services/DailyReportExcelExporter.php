<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Copie du patron `KpiExcelExporter`/`CashLedgerExcelExporter` — même style d'en-tête. */
class DailyReportExcelExporter
{
    private const HEADER_STYLE = [
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
    ];

    public function download(array $data): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();

        $this->writeSummarySheet($spreadsheet->getActiveSheet(), $data);

        $sheet = $spreadsheet->createSheet();
        $this->writeCashiersSheet($sheet, $data['cashiers']);

        $filename = "bilan-journalier-{$data['date']}.xlsx";

        return new StreamedResponse(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    private function writeSummarySheet(Worksheet $sheet, array $data): void
    {
        $sheet->setTitle('Synthèse');
        $sheet->fromArray([
            ['Bilan journalier — '.\App\Models\AppSetting::nameFor(auth()->user()?->pressing_id)],
            ["Date : {$data['date']}"],
            ["Agence : ".($data['agency_name'] ?? '—')],
        ], null, 'A1');

        $rows = [
            ['Indicateur', 'Valeur'],
            ['Chiffre d\'affaires encaissé (FCFA)', $data['stats']['revenue_today']],
            ['Impayés (FCFA)', $data['stats']['outstanding']],
            ['Nombre de transactions', $data['stats']['transactions_count']],
            ['Panier moyen (FCFA)', $data['stats']['average_basket']],
            ['Écart de caisse (FCFA)', $data['stats']['cash_variance'] ?? '—'],
            ['Espèces (FCFA)', $data['payments_by_method']['espece']['amount']],
            ['Carte (FCFA)', $data['payments_by_method']['carte']['amount']],
            ['Flooz (FCFA)', $data['payments_by_method']['flooz']['amount']],
            ['T-Money (FCFA)', $data['payments_by_method']['tmoney']['amount']],
            ['Entrées de caisse (FCFA)', $data['movements_summary']['in_total']],
            ['Sorties de caisse (FCFA)', $data['movements_summary']['out_total']],
            ['Factures soldées aujourd\'hui', $data['settled_today']['count']],
            ['Factures impayées émises aujourd\'hui', $data['unpaid_today']['count']],
            ['Remises accordées (FCFA)', $data['discounts_today']],
        ];
        $sheet->fromArray($rows, null, 'A5');
        $sheet->getStyle('A5:B5')->applyFromArray(self::HEADER_STYLE);
        $sheet->getColumnDimension('A')->setWidth(42);
        $sheet->getColumnDimension('B')->setWidth(18);
    }

    private function writeCashiersSheet(Worksheet $sheet, array $cashiers): void
    {
        $sheet->setTitle('Performance des caissiers');
        $headers = ['Caissier', 'CA encaissé (FCFA)', 'Nb tickets', 'Panier moyen (FCFA)', 'Statut'];
        $sheet->fromArray([$headers], null, 'A1');
        $sheet->getStyle('A1:E1')->applyFromArray(self::HEADER_STYLE);

        $row = 2;
        foreach ($cashiers as $cashier) {
            $sheet->fromArray([[
                $cashier['name'],
                $cashier['amount'],
                $cashier['transactions_count'],
                $cashier['average_basket'],
                $cashier['status'] ?? '—',
            ]], null, "A{$row}");
            $row++;
        }

        foreach (['A', 'B', 'C', 'D', 'E'] as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }
    }
}
