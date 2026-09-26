<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\InvoiceService;
use App\Services\OrderItemStatusTransitioner;
use App\Services\OrderNumberGenerator;
use App\Services\PaymentService;
use App\Services\QrCodeGenerator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Commandes de démonstration réparties sur les 14 derniers jours, à tous les
 * stades du workflow, avec factures et paiements. Tout passe par les services
 * métier (numérotation, QR, transitions, facturation, paiement) pour produire
 * des données cohérentes, historique de statuts compris.
 */
class OrderSeeder extends Seeder
{
    private const ORDERS_PER_AGENCY = 12;

    /**
     * Étapes suivies par tous les articles d'une commande pour atteindre chaque statut cible.
     */
    private const PATHS = [
        'recu' => [],
        'trie' => ['trie'],
        'en_traitement' => ['trie', 'en_traitement'],
        'controle_qualite' => ['trie', 'en_traitement', 'controle_qualite'],
        'pret' => ['trie', 'en_traitement', 'controle_qualite', 'pret'],
        'livre' => ['trie', 'en_traitement', 'controle_qualite', 'pret', 'livre'],
        'non_recupere' => ['trie', 'en_traitement', 'controle_qualite', 'pret', 'non_recupere'],
    ];

    public function __construct(
        private readonly OrderNumberGenerator $orderNumbers,
        private readonly QrCodeGenerator $qrCodes,
        private readonly OrderItemStatusTransitioner $transitioner,
        private readonly InvoiceService $invoices,
        private readonly PaymentService $payments,
    ) {}

    public function run(): void
    {
        $targets = ['recu', 'recu', 'trie', 'en_traitement', 'en_traitement', 'controle_qualite', 'pret', 'pret', 'livre', 'livre', 'livre', 'non_recupere'];

        try {
            foreach (Agency::with('services', 'clients')->get() as $agency) {
                // Idempotent : on ne double pas les commandes d'une agence déjà peuplée.
                if (Order::where('agency_id', $agency->id)->exists()) {
                    continue;
                }

                $staff = User::where('agency_id', $agency->id)->with('role')->get()->keyBy(fn (User $user) => $user->role->name);
                $reception = $staff['Accueil'];
                $technician = $staff['Technicien'] ?? $reception;
                $courier = $staff['Livreur'] ?? $reception;

                for ($i = 0; $i < self::ORDERS_PER_AGENCY; $i++) {
                    $target = $targets[$i % count($targets)];
                    // Les commandes les plus avancées sont aussi les plus anciennes.
                    Carbon::setTestNow();
                    $createdAt = now()->subDays(count(self::PATHS[$target]) * 2 + fake()->numberBetween(1, 3))->setTime(fake()->numberBetween(8, 17), fake()->numberBetween(0, 59));
                    Carbon::setTestNow($createdAt);

                    $order = $this->createOrder($agency, $reception);

                    foreach (self::PATHS[$target] as $step) {
                        Carbon::setTestNow(now()->addHours(fake()->numberBetween(3, 20)));
                        $actor = $step === 'livre' ? $courier : $technician;
                        $context = $step === 'pret' ? ['quality_check_result' => 'ok'] : [];

                        foreach ($order->items as $item) {
                            $this->transitioner->transition($item, $step, $actor, $context);
                        }
                    }

                    // Le statut de commande n'a pas de valeur « non récupéré » : l'article reste prêt côté commande.
                    $order->status = $target === 'non_recupere' ? 'pret' : $target;
                    $order->delivered_at = $target === 'livre' ? now() : null;
                    $order->save();

                    $this->bill($order, $target, $reception);
                }

                // Une commande annulée pour illustrer ce statut.
                Carbon::setTestNow();
                Carbon::setTestNow(now()->subDays(fake()->numberBetween(3, 10)));
                $cancelled = $this->createOrder($agency, $reception);
                $cancelled->update(['status' => 'annule', 'notes' => 'Annulée à la demande du client.']);
                Carbon::setTestNow();
            }
        } finally {
            Carbon::setTestNow();
        }
    }

    private function createOrder(Agency $agency, User $reception): Order
    {
        $isExpress = fake()->boolean(20);

        $order = Order::create([
            'agency_id' => $agency->id,
            'client_id' => $agency->clients->random()->id,
            'created_by' => $reception->id,
            'order_number' => $this->orderNumbers->next($agency->id),
            'status' => 'recu',
            'is_express' => $isExpress,
            'source' => 'comptoir',
            'sync_status' => 'synced',
            'promised_at' => now()->addDays($isExpress ? 1 : 3),
            'discount_amount' => 0,
            'notes' => fake()->optional(0.3)->randomElement(['Tache sur le col.', 'Bouton manquant.', 'Client pressé.', 'Tissu délicat.']),
        ]);

        $total = 0;
        foreach ($agency->services->random(fake()->numberBetween(1, 3)) as $service) {
            $unitPrice = $service->pivot->price_override ?? $service->base_price;
            $quantity = fake()->numberBetween(1, 4);

            $order->items()->create([
                'agency_id' => $agency->id,
                'service_id' => $service->id,
                'qr_code' => $this->qrCodes->generateCode($agency->code),
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'status' => 'recu',
            ]);

            $total += $unitPrice * $quantity;
        }

        $order->update(['total_amount' => $total]);

        return $order->load('items');
    }

    /**
     * Livrées : facturées et soldées. Prêtes / non récupérées : facturées, payées en partie ou pas.
     * Une commande en traitement sur deux : facture émise d'avance, sans paiement.
     */
    private function bill(Order $order, string $target, User $reception): void
    {
        if (! in_array($target, ['livre', 'pret', 'non_recupere', 'en_traitement'], true)) {
            return;
        }
        if ($target === 'en_traitement' && fake()->boolean()) {
            return;
        }

        $invoice = $this->invoices->createFromOrder($order);
        $base = [
            'agency_id' => $order->agency_id,
            'invoice_id' => $invoice->id,
            'client_id' => $order->client_id,
        ];

        if ($target === 'livre') {
            $method = fake()->randomElement(['espece', 'espece', 'flooz', 'tmoney', 'carte']);
            if ($method === 'espece') {
                $this->payments->recordCashPayment([...$base, 'amount' => $invoice->total_amount], $reception);
            } else {
                // Paiement distant confirmé par le callback de l'opérateur, comme en production.
                $payment = $this->payments->initiateRemotePayment([...$base, 'method' => $method, 'amount' => $invoice->total_amount]);
                $this->payments->handleWebhook($method, $payment->external_reference, 'success', ['seed' => true]);
            }
        } elseif ($target === 'pret' && fake()->boolean()) {
            $this->payments->recordCashPayment([...$base, 'amount' => intdiv($invoice->total_amount, 2)], $reception);
        }
    }
}
