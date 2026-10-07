<?php

namespace App\Console\Commands;

use App\Models\Client;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md) : `clients.loyalty_spend_12m` est
 * incrémenté en direct à chaque paiement (`LoyaltyService`) pour une mise à jour
 * immédiate, mais cet incrément ne fait jamais sortir un paiement de plus de 12 mois
 * de la fenêtre glissante. Cette commande recalcule la valeur exacte chaque nuit à
 * partir de `payments` (source de vérité), en une seule requête agrégée — jamais une
 * boucle client par client, pour rester bon marché même avec beaucoup de clients.
 */
class RecalculateLoyaltySpend extends Command
{
    protected $signature = 'loyalty:recalculate-spend';

    protected $description = "Recalcule les dépenses glissantes sur 12 mois de chaque client à partir des paiements réels";

    public function handle(): int
    {
        $affected = DB::update('
            update clients
            set loyalty_spend_12m = coalesce((
                select sum(payments.amount)
                from payments
                where payments.client_id = clients.id
                  and payments.status = ?
                  and payments.paid_at >= ?
            ), 0)
            where clients.deleted_at is null
        ', ['complete', now()->subMonths(12)]);

        $this->info("Dépenses glissantes recalculées pour {$affected} client(s).");

        return self::SUCCESS;
    }
}
