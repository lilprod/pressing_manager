<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Historique des publications de branding (append-only, mirrors AuditLog) — voir
 * CLAUDE.md « Branding — brouillon / publication + versions ».
 */
class AppSettingVersion extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'app_setting_id', 'pressing_id', 'data', 'restored_from_version_id', 'published_by', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function appSetting(): BelongsTo
    {
        return $this->belongsTo(AppSetting::class);
    }

    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by');
    }

    public function restoredFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'restored_from_version_id');
    }
}
