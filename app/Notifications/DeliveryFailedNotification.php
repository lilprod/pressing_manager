<?php

namespace App\Notifications;

use App\Models\Delivery;
use Illuminate\Notifications\Messages\MailMessage;

class DeliveryFailedNotification extends ConfigurableNotification
{
    public function __construct(private readonly Delivery $delivery) {}

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Échec de livraison — commande n° {$this->delivery->order->order_number}")
            ->line("La livraison de votre commande n° {$this->delivery->order->order_number} n'a pas pu être effectuée ({$this->delivery->failure_reason}).")
            ->line('Votre agence vous recontactera pour convenir d\'un nouveau créneau.');
    }

    public function summary(): string
    {
        $name = \App\Models\AppSetting::nameFor($this->delivery->agency?->pressing_id);

        return "{$name} : la livraison de votre commande n° {$this->delivery->order->order_number} a échoué. Votre agence va vous recontacter.";
    }
}
