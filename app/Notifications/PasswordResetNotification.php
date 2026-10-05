<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Réinitialisation de mot de passe en libre-service — calquée mot pour mot sur
 * `UserInvitationNotification` (même pipeline mail, `config('mail.default')`).
 * Canal SMS volontairement absent : aucune passerelle réelle n'existe dans l'app
 * (voir CLAUDE.md « 01 Authentification »), e-mail uniquement pour la v1.
 */
class PasswordResetNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Réinitialisation de votre mot de passe Pressing Manager')
            ->greeting("Bonjour {$notifiable->name},")
            ->line('Une demande de réinitialisation de mot de passe a été effectuée pour votre compte.')
            ->action('Réinitialiser le mot de passe', url("/reset-password?token={$this->token}"))
            ->line('Ce lien expire dans 30 minutes.')
            ->line("Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.");
    }
}
