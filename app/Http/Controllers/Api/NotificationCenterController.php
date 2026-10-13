<?php

namespace App\Http\Controllers\Api;

use App\Models\AgencySetting;
use App\Models\NotificationLog;
use App\Models\NotificationSetting;
use App\Models\NotificationTemplate;
use App\Services\NotificationService;
use App\Services\NotificationTemplateRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Écran Notifications (capture Figma, audit du 2026-10-13) : modèles, aperçu, envoi
 * de test, horaires silencieux / consentement, statistiques par canal, export des logs
 * et vérification de la configuration d'envoi. Tout est scopé à une agence.
 */
class NotificationCenterController extends ApiController
{
    public function __construct(private readonly NotificationService $notifications, private readonly NotificationTemplateRenderer $renderer) {}

    private function agencyId(Request $request): int
    {
        $this->authorizePermission($request->user(), 'notifications.manage');
        $agencyId = $request->user()->effectiveAgencyId($request->filled('agency_id') ? $request->integer('agency_id') : null);
        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }
        $this->authorizeAgency($request->user(), $agencyId);

        return $agencyId;
    }

    public function templates(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $templates = [];
        foreach (NotificationSetting::EVENTS as $event) {
            foreach (['sms', 'mail'] as $channel) {
                $templates[] = NotificationTemplate::resolve($agencyId, $event, $channel);
            }
        }

        return response()->json(['templates' => $templates, 'variables' => NotificationTemplateRenderer::VARIABLES]);
    }

    public function saveTemplate(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $data = $request->validate([
            'event' => ['required', Rule::in(NotificationSetting::EVENTS)],
            'channel' => ['required', Rule::in(['sms', 'mail'])],
            'name' => ['required', 'string', 'max:120'],
            'subject' => ['nullable', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:2000'],
        ]);

        NotificationTemplate::updateOrCreate(
            ['agency_id' => $agencyId, 'event' => $data['event'], 'channel' => $data['channel']],
            ['name' => $data['name'], 'subject' => $data['subject'] ?? null, 'body' => $data['body'], 'updated_by' => $request->user()->id],
        );

        return response()->json(NotificationTemplate::resolve($agencyId, $data['event'], $data['channel']));
    }

    /** Revient au modèle par défaut (suppression du modèle personnalisé). */
    public function resetTemplate(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $data = $request->validate(['event' => ['required', Rule::in(NotificationSetting::EVENTS)], 'channel' => ['required', Rule::in(['sms', 'mail'])]]);
        NotificationTemplate::where(['agency_id' => $agencyId, 'event' => $data['event'], 'channel' => $data['channel']])->delete();

        return response()->json(NotificationTemplate::resolve($agencyId, $data['event'], $data['channel']));
    }

    /** Aperçu rendu avec les données du dernier dépôt réel de l'agence. */
    public function preview(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $data = $request->validate(['body' => ['required', 'string', 'max:2000'], 'subject' => ['nullable', 'string', 'max:200']]);
        $context = $this->notifications->sampleContext($agencyId);
        $body = $this->renderer->render($data['body'], $context);

        return response()->json([
            'subject' => $this->renderer->render($data['subject'] ?? '', $context),
            'body' => $body,
            'length' => mb_strlen($body),
            'sms_segments' => (int) max(1, ceil(mb_strlen($body) / 160)),
            'sample_order' => $context['order']?->id,
        ]);
    }

    public function sendTest(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $data = $request->validate([
            'event' => ['required', Rule::in(NotificationSetting::EVENTS)],
            'channel' => ['required', Rule::in(['sms', 'mail'])],
            'recipient' => ['required', 'string', 'max:255', $request->input('channel') === 'mail' ? 'email' : 'regex:/^\+?[0-9 ]{6,20}$/'],
            'subject' => ['nullable', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:2000'],
        ]);

        $log = $this->notifications->sendTest($agencyId, $data['event'], $data['channel'], $data['recipient'], $data['subject'] ?? null, $data['body']);

        return response()->json($log, 201);
    }

    /** Horaires silencieux + consentement (réglages par agence). */
    public function rules(Request $request): JsonResponse
    {
        $settings = AgencySetting::forAgency($this->agencyId($request));

        return response()->json($settings->only(['notif_quiet_enabled', 'notif_quiet_start', 'notif_quiet_end', 'notif_require_consent', 'notif_unsubscribe_link']));
    }

    public function updateRules(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $data = $request->validate([
            'notif_quiet_enabled' => ['sometimes', 'boolean'],
            'notif_quiet_start' => ['sometimes', 'date_format:H:i'],
            'notif_quiet_end' => ['sometimes', 'date_format:H:i'],
            'notif_require_consent' => ['sometimes', 'boolean'],
            'notif_unsubscribe_link' => ['sometimes', 'boolean'],
        ]);
        $settings = AgencySetting::forAgency($agencyId);
        $settings->update($data);

        return response()->json($settings->only(array_keys($data) ?: ['notif_quiet_enabled']));
    }

    /** Statistiques par canal sur 30 jours (envois de test exclus). */
    public function stats(Request $request): JsonResponse
    {
        $agencyId = $this->agencyId($request);
        $rows = NotificationLog::query()
            ->where('agency_id', $agencyId)
            ->where('is_test', false)
            ->where('sent_at', '>=', now()->subDays(30))
            ->selectRaw('channel, status, count(*) as total')
            ->groupBy('channel', 'status')
            ->get();

        $by = fn (string $channel) => $rows->where('channel', $channel)->pluck('total', 'status')->map(fn ($v) => (int) $v)->all();

        return response()->json([
            'period_days' => 30,
            'mail' => $by('mail'),
            'sms' => $by('sms'),
            'mail_driver' => config('mail.default'),
            'mail_from' => config('mail.from.address'),
            'sms_gateway' => null,
        ]);
    }

    /** Vérifie la configuration d'envoi réelle (transport e-mail, passerelle SMS). */
    public function checkConfiguration(Request $request): JsonResponse
    {
        $this->agencyId($request);
        $driver = config('mail.default');
        $from = config('mail.from.address');
        $mailOk = $driver !== null && $from !== null && filter_var($from, FILTER_VALIDATE_EMAIL) !== false;

        return response()->json([
            'mail' => ['ok' => $mailOk, 'driver' => $driver, 'from' => $from, 'delivers' => ! in_array($driver, ['log', 'array', null], true)],
            'sms' => ['ok' => false, 'gateway' => null],
        ]);
    }

    public function exportLogs(Request $request): StreamedResponse
    {
        $agencyId = $this->agencyId($request);
        $logs = NotificationLog::query()
            ->with('client:id,first_name,last_name')
            ->where('agency_id', $agencyId)
            ->when($request->filled('event'), fn ($q) => $q->where('event', $request->string('event')->value()))
            ->where('sent_at', '>=', now()->subDays($request->integer('days', 30)))
            ->latest('sent_at')
            ->limit(5000)
            ->get();

        return response()->streamDownload(function () use ($logs) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'Canal', 'Destinataire', 'Client', 'Évènement', 'Statut', 'Message'], ';');
            foreach ($logs as $log) {
                fputcsv($out, [
                    $log->sent_at?->format('d/m/Y H:i'),
                    $log->channel === 'mail' ? 'E-mail' : 'SMS',
                    $log->recipient,
                    trim(($log->client->first_name ?? '').' '.($log->client->last_name ?? '')),
                    $log->event,
                    $log->status,
                    $log->message,
                ], ';');
            }
            fclose($out);
        }, 'notifications-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
