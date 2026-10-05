<?php

namespace App\Models;

use App\Models\Concerns\PlatformAuditable;
use Illuminate\Database\Eloquent\Model;

/**
 * Identité de la console superadmin elle-même (logo/nom/couleurs/contacts) — distincte
 * du branding tenant (`AppSetting`, par pressing). Singleton global, mirrors
 * `AppSetting::current()` mais sans dimension pressing : c'est la console Spark.
 */
class PlatformSetting extends Model
{
    use PlatformAuditable;

    protected $fillable = [
        'app_name', 'logo_path', 'favicon_path', 'primary_color', 'secondary_color',
        'support_email', 'support_phone', 'legal_entity_name',
    ];

    public static function current(): self
    {
        return static::query()->first() ?? static::create([])->refresh();
    }
}
