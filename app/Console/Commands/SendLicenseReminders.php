<?php

namespace App\Console\Commands;

use App\Models\License;
use App\Models\User;
use App\Notifications\LicenseExpiringNotification;
use Illuminate\Console\Command;

class SendLicenseReminders extends Command
{
    protected $signature = 'licenses:send-reminders';

    protected $description = "Notifie les administrateurs de chaque pressing à J-7, J-1 et J0 avant l'expiration de sa licence";

    /**
     * Depuis l'harmonisation licence/plateforme (voir CLAUDE.md), chaque pressing a
     * sa propre ligne `licenses` — la commande parcourt désormais toutes les licences,
     * pas une seule ligne deployment-wide.
     */
    public function handle(): int
    {
        $notified = 0;

        License::query()->get()->each(function (License $license) use (&$notified) {
            $daysRemaining = (int) now()->startOfDay()->diffInDays($license->expires_at->copy()->startOfDay(), false);

            if (! in_array($daysRemaining, config('licensing.reminder_days'), true)) {
                return;
            }

            $admins = User::where('pressing_id', $license->pressing_id)
                ->whereHas('role', fn ($query) => $query->where('slug', 'admin'))
                ->get();

            foreach ($admins as $admin) {
                $admin->notify(new LicenseExpiringNotification($license, $daysRemaining));
                $notified++;
            }
        });

        $this->info("Rappel(s) envoyé(s) : {$notified}.");

        return self::SUCCESS;
    }
}
