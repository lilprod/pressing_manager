<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationSetting extends Model
{
    public const EVENTS = [
        'order_received', 'order_processing', 'order_ready', 'order_delayed', 'pickup_completed',
        'payment_received', 'loyalty_points', 'delivery_completed', 'delivery_failed',
    ];

    /** Évènements différables pendant les horaires silencieux (non urgents). */
    public const DEFERRABLE = ['order_processing', 'loyalty_points'];

    /** Évènements à caractère promotionnel : soumis au consentement du client. */
    public const MARKETING = ['loyalty_points'];

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
