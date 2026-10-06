<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Phase 4 : invitation par e-mail à la création d'un compte, en complément du mot
 * de passe temporaire déjà affiché à l'admin (jamais en remplacement — voir
 * CLAUDE.md « Licence / facturation — gap d'harmonisation » §4 : garder le repli
 * affiché reste plus honnête que de prétendre que l'e-mail est systématiquement
 * livré, aucune passerelle réelle n'étant garantie selon l'environnement).
 */
class UserInvitationNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $temporaryPassword) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Votre compte '.\App\Models\AppSetting::nameFor($notifiable->pressing_id).' a été créé')
            ->greeting("Bonjour {$notifiable->name},")
            ->line('Un compte vient de vous être créé sur '.\App\Models\AppSetting::nameFor($notifiable->pressing_id).'.')
            ->line("Mot de passe temporaire : {$this->temporaryPassword}")
            ->line('Vous devrez le changer dès votre première connexion.')
            ->action('Se connecter', url('/login'));
    }
}
