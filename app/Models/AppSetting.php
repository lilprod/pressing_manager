<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AppSetting extends Model
{
    use Auditable;

    protected $fillable = [
        'pressing_id', 'pressing_name', 'address', 'phone', 'email', 'tax_id', 'website', 'legal_notice',
        'logo_path', 'favicon_path', 'primary_color', 'secondary_color', 'monogram',
        'ticket_footer', 'ticket_conditions', 'draft_data', 'draft_saved_at',
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
            'draft_data' => 'array',
            'draft_saved_at' => 'datetime',
        ];
    }

    public function versions(): HasMany
    {
        return $this->hasMany(AppSettingVersion::class)->latest('created_at');
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
            ?? static::create(['pressing_id' => $pressingId, 'pressing_name' => config('app.name')])->refresh();
    }

    /**
     * Nom affiché du pressing (e-mails, exports, PDF) : celui saisi par le tenant dans
     * Paramètres, sinon le nom du déploiement (APP_NAME). Lecture seule : ne crée pas de ligne.
     */
    public static function nameFor(?int $pressingId): string
    {
        $name = $pressingId === null ? null : static::query()->where('pressing_id', $pressingId)->value('pressing_name');

        return $name !== null && $name !== '' ? $name : config('app.name');
    }

    /** Scopé par pressing_id, pas agency_id — pas d'agence à rattacher. */
    protected function auditAgencyId(): ?int
    {
        return null;
    }
}
