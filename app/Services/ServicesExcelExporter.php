<?php

namespace App\Services;

use App\Models\Service;
use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export Excel du catalogue (écran "Catalogue articles et tarifs", bouton Exporter) —
 * même patron que OrdersExcelExporter/KpiExcelExporter (PhpSpreadsheet, déjà une
 * dépendance du projet).
 */
class ServicesExcelExporter
{
    private const HEADER_STYLE = [
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
    ];

    /**
     * @param  Collection<int, Service>  $services
     */
    public function download(Collection $services): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Catalogue');

        $sheet->fromArray([
            ['Catalogue articles et tarifs — Pressing Manager'],
            ['Exporté le : '.now()->format('d/m/Y H:i')],
        ], null, 'A1');

        $headers = ['Code', 'Nom', 'Catégorie', 'Mode de facturation', 'Prix de base (FCFA)', 'Durée estimée (h)', 'Statut', 'Disponibilité'];
        $sheet->fromArray([$headers], null, 'A4');
        $sheet->getStyle('A4:H4')->applyFromArray(self::HEADER_STYLE);

        $row = 5;
        foreach ($services as $service) {
            $sheet->fromArray([[
                $service->code,
                $service->name,
                $service->category,
                $service->billing_mode,
                $service->base_price ?? '',
                $service->estimated_duration_hours,
                $service->is_active ? 'Actif' : 'Inactif',
                "{$service->available_agencies_count}/{$service->total_agencies_count} agence(s)",
            ]], null, "A{$row}");
            $row++;
        }

        foreach (range('A', 'H') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $filename = 'catalogue-'.now()->format('Y-m-d').'.xlsx';

        return new StreamedResponse(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
