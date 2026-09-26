<?php

namespace App\Notifications;

use App\Models\Delivery;
use Illuminate\Notifications\Messages\MailMessage;

class DeliveryCompletedNotification extends ConfigurableNotification
{
    public function __construct(private readonly Delivery $delivery) {}

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Livraison effectuée — commande n° {$this->delivery->order->order_number}")
            ->line("Votre commande n° {$this->delivery->order->order_number} vient d'être livrée à l'adresse indiquée.")
            ->line('Merci de votre confiance.');
    }

    public function summary(): string
    {
        return "Pressing Manager : votre commande n° {$this->delivery->order->order_number} a été livrée.";
    }
}
