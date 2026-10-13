<?php

namespace App\Console\Commands;

use App\Services\NotificationService;
use Illuminate\Console\Command;

/** Envoie les notifications différées pendant les horaires silencieux une fois la plage terminée. */
class FlushDeferredNotifications extends Command
{
    protected $signature = 'notifications:flush-deferred';

    protected $description = 'Envoie les notifications différées (horaires silencieux)';

    public function handle(NotificationService $notifications): int
    {
        $this->info($notifications->flushDeferred().' notification(s) envoyée(s).');

        return self::SUCCESS;
    }
}
