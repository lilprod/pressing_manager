<?php

namespace App\Notifications;

use App\Models\OrderPickup;
use Illuminate\Notifications\Messages\MailMessage;

class PickupCompletedNotification extends ConfigurableNotification
{
    public function __construct(private readonly OrderPickup $pickup) {}

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->pickup->order;

        return (new MailMessage)
            ->subject("Retrait confirmé — commande n° {$order->order_number}")
            ->line("Le retrait de votre commande n° {$order->order_number} vient d'être confirmé.")
            ->line('Merci de votre confiance.');
    }

    public function summary(): string
    {
        $name = \App\Models\AppSetting::nameFor($this->pickup->agency?->pressing_id);

        return "{$name} : le retrait de votre commande n° {$this->pickup->order->order_number} a été confirmé.";
    }
}
