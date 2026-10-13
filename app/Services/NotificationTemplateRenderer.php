<?php

namespace App\Services;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use App\Models\Payment;

/** Remplace les variables {{...}} d'un modèle par les données réelles du contexte. */
class NotificationTemplateRenderer
{
    public const VARIABLES = [
        'client.prenom', 'client.nom', 'agence.nom', 'agence.telephone',
        'depot.numero', 'depot.montant', 'depot.solde', 'depot.date_limite',
        'paiement.montant', 'paiement.mode', 'fidelite.points_gagnes', 'fidelite.solde',
    ];

    private const METHODS = ['espece' => 'espèces', 'carte' => 'carte', 'flooz' => 'Flooz', 'tmoney' => 'T-Money'];

    /** @param  array{client?:Client|null, order?:Order|null, payment?:Payment|null, agency?:Agency|null, points?:int|null}  $context */
    public function variables(array $context): array
    {
        $client = $context['client'] ?? null;
        $order = $context['order'] ?? null;
        $payment = $context['payment'] ?? null;
        $agency = $context['agency'] ?? $order?->agency ?? ($client ? $client->agency : null);

        $balance = null;
        if ($order !== null) {
            $order->loadMissing('invoice.payments');
            $balance = (int) $order->invoice->sum(fn ($invoice) => max(0, $invoice->total_amount - $invoice->payments->where('status', 'complete')->sum('amount')));
        }

        return [
            'client.prenom' => $client?->first_name ?? '',
            'client.nom' => $client?->last_name ?? '',
            'agence.nom' => $agency?->name ?? '',
            'agence.telephone' => $agency?->phone ?? '',
            'depot.numero' => $order ? $order->agency->formatOrderNumber($order->order_number) : '',
            'depot.montant' => $order ? $this->money($order->total_amount) : '',
            'depot.solde' => $balance !== null ? $this->money($balance) : '',
            'depot.date_limite' => $order?->promised_at?->format('d/m/Y') ?? '',
            'paiement.montant' => $payment ? $this->money($payment->amount) : '',
            'paiement.mode' => $payment ? (self::METHODS[$payment->method] ?? $payment->method) : '',
            'fidelite.points_gagnes' => isset($context['points']) ? (string) $context['points'] : '',
            'fidelite.solde' => $client ? (string) $client->loyalty_points : '',
        ];
    }

    public function render(string $text, array $context): string
    {
        $vars = $this->variables($context);

        return preg_replace_callback('/\{\{\s*([a-z_.]+)\s*\}\}/', fn ($m) => $vars[$m[1]] ?? $m[0], $text);
    }

    private function money(int|float $amount): string
    {
        return number_format((float) $amount, 0, ',', ' ').' FCFA';
    }
}
