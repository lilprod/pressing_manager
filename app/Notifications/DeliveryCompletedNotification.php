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
            ->subject("Livraison effectuée — dépôt n° {$this->delivery->order->order_number}")
            ->line("Votre dépôt n° {$this->delivery->order->order_number} vient d'être livré à l'adresse indiquée.")
            ->line('Merci de votre confiance.');
    }

    public function summary(): string
    {
        $name = \App\Models\AppSetting::nameFor($this->delivery->agency?->pressing_id);

        return "{$name} : votre dépôt n° {$this->delivery->order->order_number} a été livré.";
    }
}
