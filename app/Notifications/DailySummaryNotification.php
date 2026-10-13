<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Résumé quotidien (préférence « Résumé quotidien » du profil staff), envoyé à 18 h. */
class DailySummaryNotification extends Notification
{
    use Queueable;

    /** @param  array{deposits:int, revenue:int, overdue:int, ready:int, scope:string}  $summary */
    public function __construct(private readonly array $summary) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $s = $this->summary;

        return (new MailMessage)
            ->subject('Résumé de la journée — '.$s['scope'])
            ->greeting("Bonjour {$notifiable->name},")
            ->line("Dépôts enregistrés aujourd'hui : {$s['deposits']}")
            ->line('Encaissements du jour : '.number_format($s['revenue'], 0, ',', ' ').' FCFA')
            ->line("Dépôts en retard : {$s['overdue']}")
            ->line("Dépôts prêts à retirer : {$s['ready']}")
            ->action('Ouvrir le tableau de bord', url('/dashboard'));
    }
}
