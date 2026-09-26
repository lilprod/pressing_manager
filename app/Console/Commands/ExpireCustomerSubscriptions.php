<?php

namespace App\Console\Commands;

use App\Models\CustomerSubscription;
use Illuminate\Console\Command;

class ExpireCustomerSubscriptions extends Command
{
    protected $signature = 'subscriptions:expire';

    protected $description = "Bascule les abonnements clients dont la date d'expiration est dépassée vers le statut 'expired'";

    public function handle(): int
    {
        $count = CustomerSubscription::where('status', 'active')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $this->info("{$count} abonnement(s) expiré(s).");

        return self::SUCCESS;
    }
}
