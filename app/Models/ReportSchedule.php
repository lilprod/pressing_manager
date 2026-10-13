<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class ReportSchedule extends Model
{
    protected $fillable = ['pressing_id', 'agency_id', 'created_by', 'frequency', 'format', 'recipients', 'is_active', 'last_sent_at'];

    protected function casts(): array
    {
        return ['recipients' => 'array', 'is_active' => 'boolean', 'last_sent_at' => 'datetime'];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /** Période couverte par l'envoi : la veille, la semaine passée ou le mois passé. */
    public function period(?Carbon $now = null): array
    {
        $now ??= now();

        return match ($this->frequency) {
            'weekly' => [$now->copy()->subWeek()->startOfWeek(), $now->copy()->subWeek()->endOfWeek()],
            'monthly' => [$now->copy()->subMonthNoOverflow()->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()],
            default => [$now->copy()->subDay()->startOfDay(), $now->copy()->subDay()->endOfDay()],
        };
    }

    /** Un envoi est dû : quotidien chaque jour, hebdomadaire le lundi, mensuel le 1er. */
    public function isDue(?Carbon $now = null): bool
    {
        $now ??= now();
        if (! $this->is_active || ($this->last_sent_at && $this->last_sent_at->isSameDay($now))) {
            return false;
        }

        return match ($this->frequency) {
            'weekly' => $now->isMonday(),
            'monthly' => $now->day === 1,
            default => true,
        };
    }
}
