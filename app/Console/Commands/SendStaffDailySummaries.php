<?php

namespace App\Console\Commands;

use App\Models\Agency;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Notifications\DailySummaryNotification;
use Illuminate\Console\Command;

/**
 * Envoie le résumé quotidien aux membres du personnel qui l'ont activé dans leur profil.
 * Périmètre : agences accessibles du compte (principale + complémentaires) ou tout le
 * pressing pour un compte global — mêmes règles que les écrans.
 */
class SendStaffDailySummaries extends Command
{
    protected $signature = 'staff:send-daily-summaries';

    protected $description = 'Envoie le résumé quotidien d’activité aux membres qui l’ont demandé';

    public function handle(): int
    {
        $sent = 0;
        User::query()->where('is_active', true)->whereNotNull('preferences')->each(function (User $user) use (&$sent) {
            if (! ($user->preferences['daily_summary'] ?? false)) {
                return;
            }

            $agencyIds = $user->accessibleAgencyIds() ?? Agency::where('pressing_id', $user->pressing_id)->pluck('id')->all();
            $start = now()->startOfDay();

            $user->notify(new DailySummaryNotification([
                'scope' => $user->agency?->name ?? 'toutes les agences',
                'deposits' => Order::whereIn('agency_id', $agencyIds)->where('created_at', '>=', $start)->count(),
                'revenue' => (int) Payment::whereIn('agency_id', $agencyIds)->where('status', 'complete')->where('paid_at', '>=', $start)->sum('amount'),
                'overdue' => Order::whereIn('agency_id', $agencyIds)->whereIn('status', ['recu', 'trie', 'en_traitement', 'controle_qualite'])->where('promised_at', '<', now())->count(),
                'ready' => Order::whereIn('agency_id', $agencyIds)->where('status', 'pret')->count(),
            ]));
            $sent++;
        });

        $this->info("{$sent} résumé(s) envoyé(s).");

        return self::SUCCESS;
    }
}
