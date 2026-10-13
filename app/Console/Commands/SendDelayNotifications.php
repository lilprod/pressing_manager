<?php

namespace App\Console\Commands;

use App\Models\NotificationLog;
use App\Models\Order;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/** Prévient une seule fois chaque client dont le dépôt dépasse sa date promise (évènement « Retard »). */
class SendDelayNotifications extends Command
{
    protected $signature = 'notifications:send-delays';

    protected $description = 'Notifie les clients dont le dépôt a dépassé la date promise';

    public function handle(NotificationService $notifications): int
    {
        $count = 0;
        Order::query()
            ->whereIn('status', ['recu', 'trie', 'en_traitement', 'controle_qualite'])
            ->where('promised_at', '<', now())
            ->whereNotIn('id', NotificationLog::query()->where('event', 'order_delayed')->whereNotNull('order_id')->select('order_id'))
            ->with('client', 'agency')
            ->each(function (Order $order) use ($notifications, &$count) {
                if ($order->client) {
                    $notifications->notifyEvent($order->agency_id, 'order_delayed', $order->client, ['order' => $order]);
                    $count++;
                }
            });

        $this->info("{$count} retard(s) notifié(s).");

        return self::SUCCESS;
    }
}
