<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationSetting extends Model
{
    public const EVENTS = ['order_ready', 'delivery_completed', 'delivery_failed'];

    protected $fillable = ['agency_id', 'event', 'channel_email', 'channel_sms'];

    protected function casts(): array
    {
        return [
            'channel_email' => 'boolean',
            'channel_sms' => 'boolean',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }
}
