<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class KpiExcelExporter
{
    private const HEADER_STYLE = [
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
    ];

    public function download(array $data): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();

        $this->writeSummarySheet($spreadsheet->getActiveSheet(), $data);

        if (isset($data['by_agency'])) {
            $sheet = $spreadsheet->createSheet();
            $this->writeByAgencySheet($sheet, $data['by_agency']);
        }

        $filename = "kpi-{$data['from']}-{$data['to']}.xlsx";

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
        $label = $data['scope'] === 'agency' ? ($data['agency']['name'] ?? '—') : 'Toutes les agences';

        $sheet->fromArray([
            ['Rapport KPI — '.\App\Models\AppSetting::nameFor(auth()->user()?->pressing_id)],
            ["Période : {$data['from']} au {$data['to']}"],
            ["Agence : {$label}"],
        ], null, 'A1');

        $rows = [
            ['Indicateur', 'Valeur'],
            ['Chiffre d\'affaires encaissé (FCFA)', $data['revenue']],
            ['Nombre de commandes', $data['orders_count']],
            ['Panier moyen (FCFA)', $data['average_order_value']],
            ['Taux de commandes express (%)', $data['express_rate']],
            ['Articles en stock bas', $data['low_stock_items']],
            ['Mouvements de stock', $data['stock_movements']],
            ['Livraisons totales', $data['deliveries_total']],
            ['Livraisons effectuées', $data['deliveries_completed']],
            ['Livraisons échouées', $data['deliveries_failed']],
            ['Taux de réussite des livraisons (%)', $data['delivery_completion_rate']],
            ['Présences', $data['attendance_present']],
            ['Retards', $data['attendance_retard']],
            ['Absences', $data['attendance_absent']],
            ['Heures travaillées', $data['hours_worked']],
            ['Abonnements clients actifs', $data['active_subscriptions']],
        ];
        $sheet->fromArray($rows, null, 'A5');
        $sheet->getStyle('A5:B5')->applyFromArray(self::HEADER_STYLE);
        $sheet->getColumnDimension('A')->setWidth(42);
        $sheet->getColumnDimension('B')->setWidth(18);
    }

    private function writeByAgencySheet(Worksheet $sheet, array $byAgency): void
    {
        $sheet->setTitle('Par agence');
        $headers = [
            'Agence', 'CA encaissé (FCFA)', 'Commandes', 'Panier moyen (FCFA)', 'Stock bas',
            'Livraisons', 'Livraisons OK', 'Taux livraison (%)', 'Présences', 'Retards', 'Absences',
        ];
        $sheet->fromArray([$headers], null, 'A1');
        $sheet->getStyle('A1:'.chr(64 + count($headers)).'1')->applyFromArray(self::HEADER_STYLE);

        $row = 2;
        foreach ($byAgency as $agency) {
            $sheet->fromArray([[
                $agency['agency_name'],
                $agency['revenue'],
                $agency['orders_count'],
                $agency['average_order_value'],
                $agency['low_stock_items'],
                $agency['deliveries_total'],
                $agency['deliveries_completed'],
                $agency['delivery_completion_rate'],
                $agency['attendance_present'],
                $agency['attendance_retard'],
                $agency['attendance_absent'],
            ]], null, "A{$row}");
            $row++;
        }

        foreach (range('A', chr(64 + count($headers))) as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }
    }
}
