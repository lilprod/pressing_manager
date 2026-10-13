<?php

namespace App\Console\Commands;

use App\Models\Agency;
use App\Models\AppSetting;
use App\Models\ReportSchedule;
use App\Notifications\ScheduledReportNotification;
use App\Services\KpiExcelExporter;
use App\Services\KpiService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

/** Envoie les rapports programmés dus (quotidiens, hebdomadaires le lundi, mensuels le 1er). */
class SendScheduledReports extends Command
{
    protected $signature = 'reports:send-scheduled';

    protected $description = 'Envoie par e-mail les rapports programmés';

    public function handle(KpiService $kpi, KpiExcelExporter $excel): int
    {
        $sent = 0;
        ReportSchedule::query()->where('is_active', true)->each(function (ReportSchedule $schedule) use ($kpi, $excel, &$sent) {
            if (! $schedule->isDue()) {
                return;
            }

            [$from, $to] = $schedule->period();
            $agencyIds = Agency::where('pressing_id', $schedule->pressing_id)->pluck('id')->all();
            $data = $kpi->build($schedule->agency_id, $agencyIds, $from, $to, $schedule->pressing_id);
            $base = "rapport-{$data['from']}-{$data['to']}";

            [$content, $filename, $mime] = match ($schedule->format) {
                'excel' => [$this->capture(fn () => $excel->download($data)->sendContent()), "{$base}.xlsx", 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
                'csv' => [$this->csv($data), "{$base}.csv", 'text/csv'],
                default => [Pdf::loadView('kpi.pdf', ['data' => $data])->output(), "{$base}.pdf", 'application/pdf'],
            };

            Notification::route('mail', $schedule->recipients)->notify(new ScheduledReportNotification(
                'Rapport '.AppSetting::nameFor($schedule->pressing_id)." — {$data['from']} au {$data['to']}",
                $filename,
                $content,
                $mime,
            ));
            $schedule->update(['last_sent_at' => now()]);
            $sent++;
        });

        $this->info("{$sent} rapport(s) envoyé(s).");

        return self::SUCCESS;
    }

    private function capture(callable $callback): string
    {
        ob_start();
        $callback();

        return (string) ob_get_clean();
    }

    private function csv(array $data): string
    {
        $keys = ['revenue', 'orders_count', 'average_order_value', 'discounts_total', 'pieces_count', 'pickups_count', 'cash_in', 'cash_out', 'outstanding'];
        $lines = [implode(';', ['Périmètre', ...$keys]), implode(';', [$data['agency']['name'] ?? 'Toutes les agences', ...array_map(fn ($k) => $data[$k] ?? '', $keys)])];
        foreach ($data['by_agency'] ?? [] as $row) {
            $lines[] = implode(';', [$row['agency_name'], ...array_map(fn ($k) => $row[$k] ?? '', $keys)]);
        }

        return implode("\n", $lines)."\n";
    }
}
