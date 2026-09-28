<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LicensePlan extends Model
{
    protected $fillable = ['slug', 'name', 'days', 'price', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
