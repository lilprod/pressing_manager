<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Notification\UpdateNotificationSettingRequest;
use App\Models\NotificationSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class NotificationSettingController extends ApiController
{
    /**
     * Renvoie un réglage pour chaque événement connu, avec les valeurs par défaut
     * (email activé, SMS désactivé) pour ceux jamais configurés explicitement.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'notifications.manage');

        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }
        $this->authorizeAgency($request->user(), $agencyId);

        $existing = NotificationSetting::where('agency_id', $agencyId)->get()->keyBy('event');

        $settings = collect(NotificationSetting::EVENTS)->map(function (string $event) use ($existing, $agencyId) {
            $setting = $existing->get($event);

            return [
                'agency_id' => $agencyId,
                'event' => $event,
                'channel_email' => $setting->channel_email ?? true,
                'channel_sms' => $setting->channel_sms ?? false,
            ];
        });

        return response()->json($settings->values());
    }

    public function store(UpdateNotificationSettingRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $data['agency_id']);

        $setting = NotificationSetting::updateOrCreate(
            ['agency_id' => $data['agency_id'], 'event' => $data['event']],
            ['channel_email' => $data['channel_email'], 'channel_sms' => $data['channel_sms']],
        );

        return response()->json($setting);
    }
}
