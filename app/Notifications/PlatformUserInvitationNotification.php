<?php

namespace App\Notifications;

use App\Models\PlatformSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Mirrors UserInvitationNotification (tenant) pour le royaume plateforme. */
class PlatformUserInvitationNotification extends Notification
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
            ->subject('Votre accès à la console '.PlatformSetting::current()->app_name.' a été créé')
            ->greeting("Bonjour {$notifiable->name},")
            ->line('Un compte vient de vous être créé sur la console superadmin.')
            ->line("Mot de passe temporaire : {$this->temporaryPassword}")
            ->line('Vous devrez le changer dès votre première connexion, et configurer la double authentification (obligatoire).')
            ->action('Se connecter', url('/superadmin/login'));
    }
}
