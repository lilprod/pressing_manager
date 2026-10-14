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
            ->subject("Votre dépôt n° {$this->order->order_number} est prêt")
            ->line("Bonne nouvelle : votre dépôt n° {$this->order->order_number} est prêt à être récupéré.")
            ->line('Merci de votre confiance.');
    }

    public function summary(): string
    {
        $name = \App\Models\AppSetting::nameFor($this->order->agency?->pressing_id);

        return "{$name} : votre dépôt n° {$this->order->order_number} est prêt. Merci de passer le récupérer.";
    }
}
