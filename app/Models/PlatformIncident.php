<?php

namespace App\Models;

use App\Models\Concerns\PlatformAuditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlatformIncident extends Model
{
    use PlatformAuditable;

    protected $fillable = ['pressing_id', 'title', 'description', 'priority', 'status', 'opened_by', 'resolved_by', 'resolved_at', 'resolution'];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime'];
    }

    public function pressing(): BelongsTo
    {
        return $this->belongsTo(Pressing::class);
    }

    /** Nommée `opener` (pas `openedBy`) : piège Eloquent colonne/relation, voir CLAUDE.md. */
    public function opener(): BelongsTo
    {
        return $this->belongsTo(PlatformUser::class, 'opened_by');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(PlatformUser::class, 'resolved_by');
    }
}
