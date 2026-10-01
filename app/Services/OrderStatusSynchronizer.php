<?php

namespace App\Services;

use App\Models\Order;

/**
 * Tient `orders.status` à jour à partir du statut de ses articles.
 *
 * Avant ce service, `orders.status` n'était jamais réécrit après la création de la
 * commande (toujours 'recu') : seul `order_items.status` progressait. Bug découvert en
 * construisant le module Retraits, qui a besoin de filtrer les commandes "prêtes"
 * (`orders.status = 'pret'`) — jusqu'ici ce filtre ne pouvait rien retourner.
 */
class OrderStatusSynchronizer
{
    private const WORKSHOP_ORDER = ['recu', 'trie', 'en_traitement', 'controle_qualite'];

    public function sync(Order $order): Order
    {
        $order->loadMissing('items');
        $statuses = $order->items->pluck('status');

        if ($statuses->isEmpty()) {
            return $order;
        }

        $status = match (true) {
            // Rien ne reste à remettre : tout est livré ou définitivement perdu.
            $statuses->every(fn ($s) => in_array($s, ['livre', 'perdu'], true)) => 'livre',
            // Plus aucun article en atelier : tout est prêt, livré, non récupéré ou perdu.
            $statuses->every(fn ($s) => in_array($s, ['pret', 'livre', 'non_recupere', 'perdu'], true)) => 'pret',
            default => collect(self::WORKSHOP_ORDER)
                ->first(fn ($stage) => $statuses->contains($stage)) ?? 'recu',
        };

        if ($status !== $order->status) {
            $order->status = $status;
            if ($status === 'livre' && $order->delivered_at === null) {
                $order->delivered_at = now();
            }
            $order->save();
        }

        return $order;
    }
}
