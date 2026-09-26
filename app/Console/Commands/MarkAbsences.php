<?php

namespace App\Console\Commands;

use App\Services\AttendanceService;
use Illuminate\Console\Command;

class MarkAbsences extends Command
{
    protected $signature = 'hr:mark-absences {--date= : Date à traiter (Y-m-d), hier par défaut}';

    protected $description = "Marque 'absent' les créneaux planifiés terminés sans aucun pointage";

    public function handle(AttendanceService $attendances): int
    {
        $date = $this->option('date') ? now()->parse($this->option('date')) : now()->subDay();

        $count = $attendances->markAbsences($date);

        $this->info("{$count} absence(s) enregistrée(s) pour le {$date->toDateString()}.");

        return self::SUCCESS;
    }
}
