<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationTemplate extends Model
{
    protected $fillable = ['agency_id', 'event', 'channel', 'name', 'subject', 'body', 'updated_by'];

    /** Modèle effectif (personnalisé ou par défaut) d'une agence pour un évènement/canal. */
    public static function resolve(int $agencyId, string $event, string $channel): array
    {
        $custom = static::where('agency_id', $agencyId)->where('event', $event)->where('channel', $channel)->first();
        $default = config("notification_templates.{$event}", ['name' => $event, 'subject' => $event, 'body' => '']);

        return [
            'id' => $custom?->id,
            'event' => $event,
            'channel' => $channel,
            'name' => $custom?->name ?? $default['name'],
            'subject' => $custom?->subject ?? $default['subject'],
            'body' => $custom?->body ?? $default['body'],
            'is_custom' => $custom !== null,
            'updated_at' => $custom?->updated_at,
        ];
    }
}
