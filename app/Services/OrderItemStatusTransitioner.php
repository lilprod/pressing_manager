<?php

namespace App\Services;

use App\Exceptions\InvalidStatusTransitionException;
use App\Models\OrderItem;
use App\Models\OrderItemStatusHistory;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Fait respecter le workflow défini à l'étape 1 :
 * Reçu -> Trié -> En traitement -> Contrôle qualité -> Prêt -> Livré,
 * avec retour en traitement après un contrôle qualité échoué.
 */
class OrderItemStatusTransitioner
{
    private const TRANSITIONS = [
        'recu' => ['trie', 'perdu'],
        'trie' => ['en_traitement', 'perdu'],
        'en_traitement' => ['controle_qualite', 'perdu'],
        'controle_qualite' => ['pret', 'en_traitement', 'perdu'],
        'pret' => ['livre', 'non_recupere', 'perdu'],
        'non_recupere' => ['livre', 'perdu'],
        'livre' => [],
        'perdu' => [],
    ];

    /**
     * @param  array{quality_check_result?: string|null, quality_check_notes?: string|null, is_damaged?: bool, damage_compensation_amount?: int|null, notes?: string|null}  $context
     */
    public function transition(OrderItem $item, string $to, User $actor, array $context = []): OrderItem
    {
        $from = $item->status;
        $allowed = self::TRANSITIONS[$from] ?? [];

        if (! in_array($to, $allowed, true)) {
            throw new InvalidStatusTransitionException($from, $to);
        }

        if ($from === 'controle_qualite') {
            $this->assertQualityCheckConsistency($from, $to, $context['quality_check_result'] ?? null);
        }

        return DB::transaction(function () use ($item, $from, $to, $actor, $context) {
            $item->status = $to;

            foreach (['quality_check_result', 'quality_check_notes', 'is_damaged', 'damage_compensation_amount'] as $field) {
                if (array_key_exists($field, $context)) {
                    $item->{$field} = $context[$field];
                }
            }

            if ($to === 'pret') {
                $item->ready_at = now();
            }

            if ($to === 'livre') {
                $item->delivered_at = now();
            }

            $item->save();

            OrderItemStatusHistory::create([
                'order_item_id' => $item->id,
                'from_status' => $from,
                'to_status' => $to,
                'changed_by' => $actor->id,
                'notes' => $context['notes'] ?? null,
                'changed_at' => now(),
            ]);

            return $item;
        });
    }

    private function assertQualityCheckConsistency(string $from, string $to, ?string $result): void
    {
        if ($to === 'pret' && $result !== 'ok') {
            throw new InvalidStatusTransitionException($from, $to, "Un contrôle qualité réussi ('quality_check_result' = ok) est requis pour passer à 'pret'.");
        }

        if ($to === 'en_traitement' && $result !== 'echec') {
            throw new InvalidStatusTransitionException($from, $to, "Un contrôle qualité échoué ('quality_check_result' = echec) est requis pour un retour en traitement.");
        }
    }
}
