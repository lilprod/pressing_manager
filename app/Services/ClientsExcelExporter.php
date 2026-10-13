<?php

namespace App\Services;

use App\Models\Client;
use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel du répertoire clients — même patron qu'OrdersExcelExporter. */
class ClientsExcelExporter
{
    private const HEADER_STYLE = [
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
    ];

    /** @param  Collection<int, Client>  $clients */
    public function download(Collection $clients): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Clients');

        $sheet->fromArray([
            ['Répertoire clients — '.\App\Models\AppSetting::nameFor(auth()->user()?->pressing_id)],
            ['Exporté le : '.now()->format('d/m/Y H:i')],
        ], null, 'A1');

        $headers = ['Code client', 'Client', 'Téléphone', 'Agence', 'Dernier dépôt', 'Dépôts / mois', 'Valeur client (FCFA)', 'Points', 'Palier', 'Statut'];
        $sheet->fromArray([$headers], null, 'A4');
        $sheet->getStyle('A4:J4')->applyFromArray(self::HEADER_STYLE);

        $row = 5;
        foreach ($clients as $client) {
            $sheet->fromArray([[
                $client->client_code,
                trim($client->first_name.' '.$client->last_name),
                $client->phone,
                $client->agency?->name ?? '',
                $client->last_order_at ? \Illuminate\Support\Carbon::parse($client->last_order_at)->format('d/m/Y H:i') : '',
                $client->orders_per_month,
                $client->lifetime_value,
                $client->loyalty_points,
                $client->loyalty_tier_name ?? '',
                $client->is_active ? 'Actif' : 'Inactif',
            ]], null, "A{$row}");
            $row++;
        }

        foreach (range('A', 'J') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $filename = 'clients-'.now()->format('Y-m-d').'.xlsx';

        return new StreamedResponse(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
