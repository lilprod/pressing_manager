<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = ['pressing_name', 'address', 'logo_path', 'favicon_path'];

    /** Toujours la même ligne (une seule ligne en base) : identité globale du pressing. */
    public static function current(): self
    {
        return static::query()->first() ?? static::create(['pressing_name' => 'Pressing Manager']);
    }
}
