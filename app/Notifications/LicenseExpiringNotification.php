<?php

namespace App\Notifications;

use App\Models\License;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class LicenseExpiringNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly License $license, private readonly int $daysRemaining) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)->subject($this->subject());

        if ($this->daysRemaining > 0) {
            $message->line("La licence logicielle de Pressing Manager expire dans {$this->daysRemaining} jour(s), le {$this->license->expires_at->format('d/m/Y')}.");
        } else {
            $message->line("La licence logicielle de Pressing Manager expire aujourd'hui ({$this->license->expires_at->format('d/m/Y')}).");
        }

        return $message
            ->line("Passé ce délai, l'application bascule en lecture seule pendant {$this->license->grace_period_days} jour(s) de grâce, puis se bloque totalement jusqu'au renouvellement.")
            ->action('Renouveler la licence', url('/license'))
            ->line('Merci de votre confiance.');
    }

    private function subject(): string
    {
        return $this->daysRemaining > 0
            ? "Licence Pressing Manager : expiration dans {$this->daysRemaining} jour(s)"
            : 'Licence Pressing Manager : expiration aujourd\'hui';
    }
}
