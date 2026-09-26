<?php

namespace App\Services;

use App\Models\Client;
use App\Models\NotificationLog;
use App\Models\NotificationSetting;
use App\Notifications\ConfigurableNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

class NotificationService
{
    /**
     * Envoie (ou journalise, pour le SMS) l'événement au client selon les canaux activés
     * pour l'agence. Ne fait rien si le canal est désactivé ou si le client n'a pas les
     * coordonnées nécessaires (email/téléphone).
     */
    public function notify(int $agencyId, string $event, Client $client, ConfigurableNotification $notification): void
    {
        $setting = NotificationSetting::query()->firstOrCreate(
            ['agency_id' => $agencyId, 'event' => $event],
            ['channel_email' => true, 'channel_sms' => false],
        );

        if ($setting->channel_email && $client->email) {
            Notification::route('mail', $client->email)->notify($notification);
            $this->log($agencyId, $client, $event, 'mail', $client->email, $notification->summary(), 'sent');
        }

        if ($setting->channel_sms && $client->phone) {
            // Aucune passerelle SMS (Twilio, opérateur local, etc.) n'est configurée pour ce
            // déploiement : le message est journalisé plutôt que transmis, dans une structure
            // qui permettrait de brancher un vrai opérateur sans changer les appelants.
            Log::info('[SMS simulé] '.$client->phone.' : '.$notification->summary());
            $this->log($agencyId, $client, $event, 'sms', $client->phone, $notification->summary(), 'simulated');
        }
    }

    private function log(int $agencyId, Client $client, string $event, string $channel, string $recipient, string $message, string $status): void
    {
        NotificationLog::create([
            'agency_id' => $agencyId,
            'client_id' => $client->id,
            'event' => $event,
            'channel' => $channel,
            'recipient' => $recipient,
            'message' => $message,
            'status' => $status,
            'sent_at' => now(),
        ]);
    }
}
