<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** E-mail construit à partir d'un modèle d'agence (sujet + corps déjà rendus). */
class TemplatedMailNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly string $subject, public readonly string $body, public readonly ?string $unsubscribeUrl = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject($this->subject);
        foreach (preg_split('/\R{2,}/', $this->body) as $paragraph) {
            $mail->line(trim($paragraph));
        }
        if ($this->unsubscribeUrl) {
            $mail->line('Pour ne plus recevoir ces messages : '.$this->unsubscribeUrl);
        }

        return $mail;
    }
}
