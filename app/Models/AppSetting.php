<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'pressing_name', 'address', 'phone', 'email', 'tax_id', 'logo_path', 'favicon_path',
        'password_expiry_days', 'password_expiry_warning_days', 'session_timeout_minutes',
        'password_min_length', 'password_require_uppercase', 'password_require_number', 'password_require_symbol',
    ];

    protected function casts(): array
    {
        return [
            'password_expiry_days' => 'integer',
            'password_expiry_warning_days' => 'integer',
            'session_timeout_minutes' => 'integer',
            'password_min_length' => 'integer',
            'password_require_uppercase' => 'boolean',
            'password_require_number' => 'boolean',
            'password_require_symbol' => 'boolean',
        ];
    }

    /** Toujours la même ligne (une seule ligne en base) : identité globale du pressing. */
    public static function current(): self
    {
        // ->refresh() : sur Postgres, l'INSERT ne renvoie que l'id, pas les valeurs
        // par défaut des colonnes (session_timeout_minutes, password_min_length...) ;
        // sans ce rechargement, l'instance en mémoire les aurait à null.
        return static::query()->first() ?? static::create(['pressing_name' => 'Pressing Manager'])->refresh();
    }
}
