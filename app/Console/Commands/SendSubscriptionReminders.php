<?php

namespace App\Console\Commands;

use App\Models\CustomerSubscription;
use App\Notifications\SubscriptionExpiringNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

class SendSubscriptionReminders extends Command
{
    protected $signature = 'subscriptions:send-reminders';

    protected $description = "Notifie les clients par e-mail avant l'expiration de leur abonnement (J-7, J-1, J0)";

    /**
     * SMS/push évoqués au cahier des charges ne sont pas implémentés : aucune
     * passerelle SMS n'est configurée pour ce déploiement (voir hypothèses).
     * Un client sans e-mail renseigné n'est donc simplement pas notifiable ici.
     */
    public function handle(): int
    {
        $notified = 0;

        foreach (config('licensing.reminder_days') as $daysRemaining) {
            $target = now()->addDays($daysRemaining)->startOfDay();

            $subscriptions = CustomerSubscription::where('status', 'active')
                ->whereDate('expires_at', $target->toDateString())
                ->with('plan', 'client')
                ->get();

            foreach ($subscriptions as $subscription) {
                if (! $subscription->client->email) {
                    continue;
                }

                Notification::route('mail', $subscription->client->email)
                    ->notify(new SubscriptionExpiringNotification($subscription, $daysRemaining));
                $notified++;
            }
        }

        $this->info("{$notified} rappel(s) d'abonnement envoyé(s).");

        return self::SUCCESS;
    }
}
