<?php

namespace App\Http\Requests\Profile;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'photo' => ['nullable', 'image', 'max:2048'],
            'first_name' => ['nullable', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'timezone' => ['nullable', 'timezone:all'],
            'preferences' => ['nullable', 'array'],
            'preferences.daily_summary' => ['sometimes', 'boolean'],
            'preferences.sound_alerts' => ['sometimes', 'boolean'],
            'preferences.whatsapp_alerts' => ['sometimes', 'boolean'],
        ];
    }
}
