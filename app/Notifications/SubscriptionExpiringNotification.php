<?php

namespace App\Notifications;

use App\Models\CustomerSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SubscriptionExpiringNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly CustomerSubscription $subscription, private readonly int $daysRemaining) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $planName = $this->subscription->plan->name;
        $message = (new MailMessage)->subject("Votre abonnement {$planName} arrive à échéance");

        if ($this->daysRemaining > 0) {
            $message->line("Votre abonnement « {$planName} » expire dans {$this->daysRemaining} jour(s), le {$this->subscription->expires_at->format('d/m/Y')}.");
        } else {
            $message->line("Votre abonnement « {$planName} » expire aujourd'hui.");
        }

        return $message
            ->line('Passé ce délai, vos commandes seront facturées au tarif normal jusqu\'au renouvellement.')
            ->line('Contactez votre agence pour le renouveler.');
    }
}
