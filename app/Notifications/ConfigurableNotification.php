<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Base commune aux notifications client déclenchées par un événement métier
 * (commande prête, livraison effectuée/échouée) et pilotées par NotificationService.
 * L'envoi passe toujours par le canal 'mail' de Laravel ; le SMS n'a pas de
 * passerelle réelle pour ce déploiement (voir NotificationService::notify()),
 * `summary()` sert donc à la fois de contenu SMS simulé et de résumé journalisé.
 */
abstract class ConfigurableNotification extends Notification
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    abstract public function toMail(object $notifiable): MailMessage;

    abstract public function summary(): string;
}
