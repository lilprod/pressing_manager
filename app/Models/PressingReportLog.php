<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PressingReportLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pressing_id', 'agencies_count', 'active_users_count', 'operations_count',
        'period_started_at', 'period_ended_at', 'app_version', 'ip_address', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'period_started_at' => 'datetime',
            'period_ended_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function pressing(): BelongsTo
    {
        return $this->belongsTo(Pressing::class);
    }
}
