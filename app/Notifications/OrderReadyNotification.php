<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

class OrderReadyNotification extends ConfigurableNotification
{
    public function __construct(private readonly Order $order) {}

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Votre commande n° {$this->order->order_number} est prête")
            ->line("Bonne nouvelle : votre commande n° {$this->order->order_number} est prête à être récupérée.")
            ->line('Merci de votre confiance.');
    }

    public function summary(): string
    {
        return "Pressing Manager : votre commande n° {$this->order->order_number} est prête. Merci de passer la récupérer.";
    }
}
