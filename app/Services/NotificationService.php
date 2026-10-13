<?php

namespace App\Services;

use App\Models\AgencySetting;
use App\Models\Client;
use App\Models\NotificationLog;
use App\Models\NotificationSetting;
use App\Models\NotificationTemplate;
use App\Models\Order;
use App\Models\Payment;
use App\Notifications\ConfigurableNotification;
use App\Notifications\TemplatedMailNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;

/**
 * Point d'envoi unique des notifications client. Chaque évènement passe par :
 * 1. le réglage de canaux de l'agence (e-mail / SMS) ;
 * 2. le consentement du client pour les évènements promotionnels (si l'agence l'exige) ;
 * 3. les horaires silencieux pour les évènements non urgents (envoi différé) ;
 * 4. le modèle de l'agence (personnalisé ou par défaut) pour le texte.
 *
 * Le SMS n'a pas de passerelle réelle pour ce déploiement : il est journalisé
 * (« simulated ») dans une structure qui permettrait de brancher un opérateur.
 */
class NotificationService
{
    public function __construct(private readonly NotificationTemplateRenderer $renderer) {}

    /**
     * Compatibilité avec les déclencheurs historiques (classe de notification dédiée) :
     * tant qu'aucun modèle personnalisé n'existe, le texte de la classe est conservé.
     */
    public function notify(int $agencyId, string $event, Client $client, ConfigurableNotification $notification, ?int $orderId = null): void
    {
        $this->dispatch($agencyId, $event, $client, [
            'order' => $orderId ? Order::find($orderId) : null,
        ], $notification);
    }

    /** @param  array{order?:Order|null, payment?:Payment|null, points?:int|null}  $context */
    public function notifyEvent(int $agencyId, string $event, Client $client, array $context = []): void
    {
        $this->dispatch($agencyId, $event, $client, $context, null);
    }

    private function dispatch(int $agencyId, string $event, Client $client, array $context, ?ConfigurableNotification $legacy): void
    {
        $setting = NotificationSetting::query()->firstOrCreate(
            ['agency_id' => $agencyId, 'event' => $event],
            ['channel_email' => true, 'channel_sms' => false],
        );
        $agencySettings = AgencySetting::forAgency($agencyId);
        $context['client'] = $client;
        $orderId = ($context['order'] ?? null)?->id;
        $marketing = in_array($event, NotificationSetting::MARKETING, true);

        $deferUntil = in_array($event, NotificationSetting::DEFERRABLE, true) ? $this->quietUntil($agencySettings) : null;

        if ($setting->channel_email && $client->email) {
            if ($marketing && $agencySettings->notif_require_consent && ! $client->email_consent) {
                $this->log($agencyId, $client, $event, 'mail', $client->email, 'Non envoyé : pas de consentement e-mail.', 'skipped', $orderId);
            } else {
                $template = NotificationTemplate::resolve($agencyId, $event, 'mail');
                $subject = $this->renderer->render($template['subject'] ?? '', $context);
                $body = $this->renderer->render($template['body'], $context);
                $unsubscribe = $marketing && $agencySettings->notif_unsubscribe_link
                    ? URL::signedRoute('notifications.unsubscribe', ['client' => $client->id])
                    : null;

                if ($deferUntil) {
                    $this->log($agencyId, $client, $event, 'mail', $client->email, $body, 'deferred', $orderId, $subject, $deferUntil);
                } else {
                    $mail = ($legacy && ! $template['is_custom']) ? $legacy : new TemplatedMailNotification($subject, $body, $unsubscribe);
                    Notification::route('mail', $client->email)->notify($mail);
                    $this->log($agencyId, $client, $event, 'mail', $client->email, $legacy && ! $template['is_custom'] ? $legacy->summary() : $body, 'sent', $orderId, $subject);
                }
            }
        }

        if ($setting->channel_sms && $client->phone) {
            if ($marketing && $agencySettings->notif_require_consent && ! $client->sms_consent) {
                $this->log($agencyId, $client, $event, 'sms', $client->phone, 'Non envoyé : pas de consentement SMS.', 'skipped', $orderId);

                return;
            }
            $template = NotificationTemplate::resolve($agencyId, $event, 'sms');
            $text = ($legacy && ! $template['is_custom']) ? $legacy->summary() : $this->renderer->render($template['body'], $context);

            if ($deferUntil) {
                $this->log($agencyId, $client, $event, 'sms', $client->phone, $text, 'deferred', $orderId, null, $deferUntil);
            } else {
                Log::info('[SMS simulé] '.$client->phone.' : '.$text);
                $this->log($agencyId, $client, $event, 'sms', $client->phone, $text, 'simulated', $orderId);
            }
        }
    }

    /** Envoie les messages différés dont l'heure est passée (commande planifiée). */
    public function flushDeferred(): int
    {
        $count = 0;
        NotificationLog::query()->where('status', 'deferred')->where('scheduled_for', '<=', now())->each(function (NotificationLog $log) use (&$count) {
            if ($log->channel === 'mail') {
                Notification::route('mail', $log->recipient)->notify(new TemplatedMailNotification($log->subject ?? '', $log->message));
                $log->update(['status' => 'sent', 'sent_at' => now()]);
            } else {
                Log::info('[SMS simulé] '.$log->recipient.' : '.$log->message);
                $log->update(['status' => 'simulated', 'sent_at' => now()]);
            }
            $count++;
        });

        return $count;
    }

    /** Envoi de test d'un modèle vers un destinataire saisi, avec les données du dernier dépôt réel de l'agence. */
    public function sendTest(int $agencyId, string $event, string $channel, string $recipient, ?string $subject, string $body): NotificationLog
    {
        $context = $this->sampleContext($agencyId);
        $renderedBody = $this->renderer->render($body, $context);
        $renderedSubject = $this->renderer->render($subject ?? '', $context);

        if ($channel === 'mail') {
            Notification::route('mail', $recipient)->notify(new TemplatedMailNotification('[Test] '.$renderedSubject, $renderedBody));
            $status = 'sent';
        } else {
            Log::info('[SMS simulé - test] '.$recipient.' : '.$renderedBody);
            $status = 'simulated';
        }

        return NotificationLog::create([
            'agency_id' => $agencyId,
            'client_id' => null,
            'event' => $event,
            'channel' => $channel,
            'recipient' => $recipient,
            'message' => $renderedBody,
            'subject' => $channel === 'mail' ? $renderedSubject : null,
            'status' => $status,
            'sent_at' => now(),
            'is_test' => true,
        ]);
    }

    /** Contexte d'aperçu : dernier dépôt réel de l'agence (jamais des données inventées). */
    public function sampleContext(int $agencyId): array
    {
        $order = Order::query()->where('agency_id', $agencyId)->with('client', 'agency')->latest()->first();
        $payment = Payment::query()->where('agency_id', $agencyId)->where('status', 'complete')->latest('paid_at')->first();

        return ['order' => $order, 'client' => $order?->client, 'payment' => $payment, 'agency' => $order?->agency ?? \App\Models\Agency::find($agencyId)];
    }

    /** Fin de la plage silencieuse en cours, ou null si l'on est hors plage / désactivé. */
    private function quietUntil(AgencySetting $settings): ?Carbon
    {
        if (! $settings->notif_quiet_enabled) {
            return null;
        }

        $now = now();
        [$sh, $sm] = array_map('intval', explode(':', $settings->notif_quiet_start));
        [$eh, $em] = array_map('intval', explode(':', $settings->notif_quiet_end));
        $start = $now->copy()->setTime($sh, $sm);
        $end = $now->copy()->setTime($eh, $em);

        if ($start->lte($end)) {
            return $now->between($start, $end) ? $end : null;
        }

        // Plage à cheval sur minuit (ex. 20:00 → 08:00).
        if ($now->gte($start)) {
            return $end->addDay();
        }

        return $now->lt($end) ? $end : null;
    }

    private function log(int $agencyId, Client $client, string $event, string $channel, string $recipient, string $message, string $status, ?int $orderId, ?string $subject = null, ?Carbon $scheduledFor = null): void
    {
        NotificationLog::create([
            'agency_id' => $agencyId,
            'client_id' => $client->id,
            'order_id' => $orderId,
            'event' => $event,
            'channel' => $channel,
            'recipient' => $recipient,
            'message' => $message,
            'subject' => $subject,
            'status' => $status,
            'sent_at' => now(),
            'scheduled_for' => $scheduledFor,
        ]);
    }
}
