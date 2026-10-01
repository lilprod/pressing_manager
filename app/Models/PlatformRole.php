<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlatformRole extends Model
{
    protected $fillable = ['slug', 'name', 'is_system'];

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
        ];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(PlatformPermission::class, 'platform_role_permission');
    }

    public function users(): HasMany
    {
        return $this->hasMany(PlatformUser::class);
    }

    public function isSuperadmin(): bool
    {
        return $this->slug === 'superadmin';
    }
}
