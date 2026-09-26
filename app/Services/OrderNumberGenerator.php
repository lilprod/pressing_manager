<?php

namespace App\Services;

use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Attribue le prochain numéro de commande d'une agence, toujours côté serveur
 * (jamais par le client hors-ligne, qui n'utilise que `client_local_uuid`).
 */
class OrderNumberGenerator
{
    public function next(int $agencyId): int
    {
        // PostgreSQL interdit FOR UPDATE combiné à un agrégat : on verrouille la ligne
        // de l'agence elle-même pour sérialiser les créations concurrentes de commandes.
        return DB::transaction(function () use ($agencyId) {
            DB::table('agencies')->where('id', $agencyId)->lockForUpdate()->first();

            $max = Order::where('agency_id', $agencyId)->max('order_number');

            return ($max ?? 0) + 1;
        });
    }
}
