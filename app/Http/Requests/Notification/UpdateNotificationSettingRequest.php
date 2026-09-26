<?php

namespace App\Http\Requests\Notification;

use App\Models\NotificationSetting;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateNotificationSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('notifications.manage');
    }

    public function rules(): array
    {
        return [
            'agency_id' => [$this->user()->agency_id ? 'prohibited' : 'required', 'integer', 'exists:agencies,id'],
            'event' => ['required', Rule::in(NotificationSetting::EVENTS)],
            'channel_email' => ['required', 'boolean'],
            'channel_sms' => ['required', 'boolean'],
        ];
    }
}
