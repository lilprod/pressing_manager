<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Avis au responsable d'un pressing (compte manager bootstrap) lorsqu'une action
 * plateforme change l'état de son compte : suspension, réactivation, renouvellement
 * de licence. Rend vraie la mention « journalisés et notifiés au responsable » de la
 * capture Pressings (la journalisation existait déjà via PlatformAuditable).
 */
class PressingAccountChangedNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $event, private readonly string $pressingName, private readonly ?string $detail = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        [$subject, $line] = match ($this->event) {
            'suspended' => ['Compte suspendu', "L'accès de {$this->pressingName} à l'application a été suspendu par l'équipe plateforme."],
            'reactivated' => ['Compte réactivé', "L'accès de {$this->pressingName} à l'application est de nouveau actif."],
            default => ['Licence renouvelée', "La licence de {$this->pressingName} a été renouvelée."],
        };

        $mail = (new MailMessage)->subject($subject.' — '.$this->pressingName)->greeting("Bonjour {$notifiable->name},")->line($line);
        if ($this->detail) {
            $mail->line($this->detail);
        }

        return $mail->line("Contactez le support de la plateforme pour toute question.");
    }
}
