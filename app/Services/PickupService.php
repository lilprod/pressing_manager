<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPickup;
use App\Models\OrderPickupItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Traite la remise des articles au comptoir (section 05 du Figma, "Retraits en
 * agence") : retrait total ou partiel, encaissement du solde restant, et blocage
 * du retrait si le solde n'est pas réglé sauf dérogation explicite et motivée.
 *
 * Le blocage est systématique (pas encore configurable par agence : voir EF-RET-05
 * dans CLAUDE.md, qui dépend d'une table `agency_settings` non construite) — seule
 * une dérogation ponctuelle, tracée sur le retrait, peut le lever.
 */
class PickupService
{
    public function __construct(
        private readonly OrderItemStatusTransitioner $transitioner,
        private readonly OrderStatusSynchronizer $statusSync,
        private readonly PaymentService $payments,
    ) {}

    /**
     * @param  array{
     *     recipient_type: string,
     *     recipient_name: string,
     *     condition_status: string,
     *     condition_notes?: string|null,
     *     items: array<int, array{order_item_id: int, quantity: int}>,
     *     payment_amount?: int|null,
     *     override_unpaid?: bool,
     *     override_reason?: string|null,
     * }  $data
     */
    public function process(Order $order, array $data, User $actor): OrderPickup
    {
        return DB::transaction(function () use ($order, $data, $actor) {
            $order->loadMissing('items', 'invoice.payments');

            $lines = $this->resolveLines($order, $data['items']);

            $balanceDue = $this->balanceDue($order);
            $collected = (int) ($data['payment_amount'] ?? 0);
            $payment = null;

            if ($collected > 0) {
                $invoice = $order->invoice->first();
                if ($invoice === null) {
                    throw new HttpException(422, 'Aucune facture à encaisser pour ce dépôt.');
                }

                $payment = $this->payments->recordCashPayment([
                    'agency_id' => $order->agency_id,
                    'client_id' => $order->client_id,
                    'invoice_id' => $invoice->id,
                    'amount' => $collected,
                ], $actor);

                $balanceDue = max(0, $balanceDue - $collected);
            }

            if ($balanceDue > 0 && empty($data['override_unpaid'])) {
                throw new HttpException(422, "Retrait bloqué : solde impayé de {$balanceDue} FCFA. Encaissez le solde ou confirmez une dérogation.");
            }

            $pickup = OrderPickup::create([
                'order_id' => $order->id,
                'agency_id' => $order->agency_id,
                'recipient_type' => $data['recipient_type'],
                'recipient_name' => $data['recipient_name'],
                'condition_status' => $data['condition_status'],
                'condition_notes' => $data['condition_notes'] ?? null,
                'payment_collected_amount' => $collected,
                'payment_id' => $payment?->id,
                'balance_overridden' => $balanceDue > 0,
                'override_reason' => $balanceDue > 0 ? ($data['override_reason'] ?? null) : null,
                'processed_by' => $actor->id,
                'processed_at' => now(),
            ]);

            foreach ($lines as $line) {
                /** @var OrderItem $item */
                $item = $line['item'];
                $item->quantity_delivered += $line['quantity'];
                $item->save();

                OrderPickupItem::create([
                    'order_pickup_id' => $pickup->id,
                    'order_item_id' => $item->id,
                    'quantity' => $line['quantity'],
                ]);

                if ($item->quantity_delivered >= $item->quantity && $item->status !== 'livre') {
                    $this->transitioner->transition($item->fresh(), 'livre', $actor, [
                        'notes' => "Remis via retrait #{$pickup->id} ({$data['recipient_name']}).",
                    ]);
                }
            }

            $this->statusSync->sync($order->fresh());

            return $pickup->load('items.orderItem', 'processor');
        });
    }

    /**
     * @param  array<int, array{order_item_id: int, quantity: int}>  $requested
     * @return array<int, array{item: OrderItem, quantity: int}>
     */
    private function resolveLines(Order $order, array $requested): array
    {
        if (empty($requested)) {
            throw new HttpException(422, 'Sélectionnez au moins un article à remettre.');
        }

        $itemsById = $order->items->keyBy('id');
        $lines = [];

        foreach ($requested as $line) {
            $item = $itemsById->get($line['order_item_id']);
            if ($item === null) {
                throw new HttpException(422, "Article #{$line['order_item_id']} introuvable sur ce dépôt.");
            }

            if (! in_array($item->status, ['pret', 'non_recupere'], true)) {
                throw new HttpException(422, "« {$item->description} » n'est pas prêt pour le retrait.");
            }

            $remaining = $item->quantity - $item->quantity_delivered;
            $quantity = (int) $line['quantity'];
            if ($quantity < 1 || $quantity > $remaining) {
                throw new HttpException(422, "Quantité invalide pour « {$item->description} » ({$remaining} restante(s)).");
            }

            $lines[] = ['item' => $item, 'quantity' => $quantity];
        }

        return $lines;
    }

    private function balanceDue(Order $order): int
    {
        return (int) $order->invoice->sum(function (Invoice $invoice) {
            $paid = $invoice->payments->where('status', 'complete')->sum('amount');

            return max(0, $invoice->total_amount - $paid);
        });
    }
}
