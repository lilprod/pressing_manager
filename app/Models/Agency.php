<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Agency extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'pressing_id', 'code', 'name', 'city', 'address', 'phone',
        'unclaimed_item_threshold_days', 'is_active', 'workshop_capacity',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function pressing(): BelongsTo
    {
        return $this->belongsTo(Pressing::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function clients(): HasMany
    {
        return $this->hasMany(Client::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'agency_services')
            ->withPivot(['price_override', 'is_active']);
    }
}
