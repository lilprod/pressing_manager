<?php

namespace App\Services;

use App\Models\Order;
use Barryvdh\DomPDF\Facade\Pdf;

class TicketPdfService
{
    /**
     * Génère le PDF du ticket de dépôt à la volée — jamais stocké, contrairement à la
     * facture : un ticket se réimprime depuis l'état courant de la commande, pas depuis
     * un instantané figé (il n'a pas la contrainte d'immutabilité fiscale de la facture).
     */
    public function render(Order $order): string
    {
        $order->loadMissing('items.service', 'client', 'agency');

        return Pdf::loadView('tickets.pdf', ['order' => $order])->output();
    }
}
