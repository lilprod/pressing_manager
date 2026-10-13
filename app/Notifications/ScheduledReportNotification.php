<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Rapport programmé envoyé en pièce jointe (PDF, Excel ou CSV). */
class ScheduledReportNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $title,
        public readonly string $filename,
        public readonly string $content,
        public readonly string $mime,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->title)
            ->line('Veuillez trouver ci-joint le rapport programmé.')
            ->attachData($this->content, $this->filename, ['mime' => $this->mime]);
    }
}
