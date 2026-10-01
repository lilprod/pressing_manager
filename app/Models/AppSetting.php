<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'pressing_id', 'pressing_name', 'address', 'phone', 'email', 'tax_id', 'logo_path', 'favicon_path',
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

    /**
     * Une ligne par pressing (pivot multi-tenant, voir CLAUDE.md) — avant cette
     * passe, une seule ligne existait pour tout le déploiement ; chaque pressing a
     * désormais sa propre identité/branding/politique de sécurité.
     */
    public static function current(int $pressingId): self
    {
        // ->refresh() : sur Postgres, l'INSERT ne renvoie que l'id, pas les valeurs
        // par défaut des colonnes (session_timeout_minutes, password_min_length...) ;
        // sans ce rechargement, l'instance en mémoire les aurait à null.
        return static::query()->where('pressing_id', $pressingId)->first()
            ?? static::create(['pressing_id' => $pressingId, 'pressing_name' => 'Pressing Manager'])->refresh();
    }
}
