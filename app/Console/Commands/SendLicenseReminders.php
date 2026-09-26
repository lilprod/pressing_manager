<?php

namespace App\Console\Commands;

use App\Models\License;
use App\Models\User;
use App\Notifications\LicenseExpiringNotification;
use Illuminate\Console\Command;

class SendLicenseReminders extends Command
{
    protected $signature = 'licenses:send-reminders';

    protected $description = "Notifie les administrateurs à J-7, J-1 et J0 avant l'expiration de la licence";

    public function handle(): int
    {
        $license = License::current();

        if ($license === null) {
            $this->info('Aucune licence configurée.');

            return self::SUCCESS;
        }

        $daysRemaining = (int) now()->startOfDay()->diffInDays($license->expires_at->copy()->startOfDay(), false);

        if (! in_array($daysRemaining, config('licensing.reminder_days'), true)) {
            $this->info("Pas de rappel dû aujourd'hui (J-{$daysRemaining}).");

            return self::SUCCESS;
        }

        $admins = User::whereHas('role', fn ($query) => $query->where('slug', 'admin'))->get();

        foreach ($admins as $admin) {
            $admin->notify(new LicenseExpiringNotification($license, $daysRemaining));
        }

        $this->info("Rappel envoyé à {$admins->count()} administrateur(s) (J-{$daysRemaining}).");

        return self::SUCCESS;
    }
}
