<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Rendu de livraison du linge (sur cintre, plié, sous housse…), référentiel par pressing. */
class FinishOption extends Model
{
    public const DEFAULTS = ['Sur cintre', 'Plié', 'Plié premium', 'Sous housse'];

    protected $fillable = ['pressing_id', 'name', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    /** Crée les rendus par défaut d'un pressing qui n'en a aucun. */
    public static function seedDefaults(int $pressingId): void
    {
        if (static::where('pressing_id', $pressingId)->exists()) {
            return;
        }
        foreach (self::DEFAULTS as $i => $name) {
            static::create(['pressing_id' => $pressingId, 'name' => $name, 'sort_order' => $i]);
        }
    }
}
