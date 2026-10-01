<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;

/**
 * Vue Kanban de l'atelier (section 04 Figma) : regroupe les statuts réels de
 * `order_items`/`orders` (déjà gérés par OrderItemStatusTransitioner et
 * OrderStatusSynchronizer) en 4 colonnes, sans ajouter de statut parallèle.
 */
class AtelierBoardService
{
    /** Statuts d'order affichés sur le tableau (hors livré/annulé). */
    public const ACTIVE_STATUSES = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret'];

    private const FORWARD_ORDER = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret'];

    private const COLUMN_BY_STATUS = [
        'recu' => 'attente',
        'trie' => 'attente',
        'en_traitement' => 'cours',
        'controle_qualite' => 'traites',
        'pret' => 'classes',
    ];

    private const NEXT_COLUMN = [
        'attente' => 'cours',
        'cours' => 'traites',
        'traites' => 'classes',
    ];

    public function __construct(private readonly OrderItemStatusTransitioner $transitioner) {}

    public static function columnFor(string $orderStatus): ?string
    {
        return self::COLUMN_BY_STATUS[$orderStatus] ?? null;
    }

    public static function nextColumnFor(string $orderStatus): ?string
    {
        $column = self::columnFor($orderStatus);

        return $column !== null ? (self::NEXT_COLUMN[$column] ?? null) : null;
    }

    /**
     * Fait progresser tous les articles d'un dépôt jusqu'à l'entrée de la colonne
     * suivante. Un article "reçu" passant de « En attente » à « En cours » traverse
     * réellement « trié » PUIS « en_traitement » : chaque saut est une transition
     * distincte, journalisée séparément (rien n'est sauté ni fabriqué).
     */
    public function advance(Order $order, User $actor): Order
    {
        $nextColumn = self::nextColumnFor($order->status);

        if ($nextColumn === null) {
            throw new \RuntimeException("Ce dépôt est déjà à la dernière étape du tableau.");
        }

        $order->loadMissing('items');

        foreach ($order->items as $item) {
            $this->advanceItem($item, $nextColumn, $actor);
        }

        return $order->fresh(['items']);
    }

    private function advanceItem(OrderItem $item, string $targetColumn, User $actor): void
    {
        while (true) {
            $currentColumn = self::columnFor($item->status);
            if ($currentColumn === null || $currentColumn === $targetColumn) {
                return;
            }

            $currentIndex = array_search($item->status, self::FORWARD_ORDER, true);
            if ($currentIndex === false || ! isset(self::FORWARD_ORDER[$currentIndex + 1])) {
                return;
            }

            $nextStatus = self::FORWARD_ORDER[$currentIndex + 1];
            // Seule la transition contrôle_qualite -> prêt exige un résultat : "faire
            // passer à Classés" depuis le tableau signifie que le contrôle est validé.
            $context = ($item->status === 'controle_qualite' && $nextStatus === 'pret')
                ? ['quality_check_result' => 'ok']
                : [];

            $item = $this->transitioner->transition($item, $nextStatus, $actor, $context);
        }
    }
}
