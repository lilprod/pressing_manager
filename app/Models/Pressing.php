<?php

namespace App\Models;

use App\Models\Concerns\PlatformAuditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Pressing extends Model
{
    use HasFactory, PlatformAuditable;

    protected $fillable = [
        'name', 'code', 'country_code', 'platform_plan_id', 'status',
        'contact_name', 'contact_email', 'contact_phone',
        'license_starts_at', 'license_expires_at',
    ];

    protected $hidden = ['report_token_hash'];

    protected function casts(): array
    {
        return [
            'license_starts_at' => 'datetime',
            'license_expires_at' => 'datetime',
            'report_token_generated_at' => 'datetime',
            'report_token_last_used_at' => 'datetime',
            'last_report_at' => 'datetime',
        ];
    }

    public function platformPlan(): BelongsTo
    {
        return $this->belongsTo(PlatformPlan::class);
    }

    public function reportLogs(): HasMany
    {
        return $this->hasMany(PressingReportLog::class);
    }

    public function platformUsers(): BelongsToMany
    {
        return $this->belongsToMany(PlatformUser::class, 'pressing_platform_user');
    }

    /**
     * Données tenant hébergées pour ce pressing (pivot multi-tenant, voir
     * CLAUDE.md) — ce même déploiement peut héberger plusieurs pressings,
     * chacun avec ses propres agences/personnel/catalogue.
     */
    public function agencies(): HasMany
    {
        return $this->hasMany(Agency::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function services(): HasMany
    {
        return $this->hasMany(Service::class);
    }

    public function treatmentTypes(): HasMany
    {
        return $this->hasMany(TreatmentType::class);
    }

    public function appSetting(): HasOne
    {
        return $this->hasOne(AppSetting::class);
    }

    public function license(): HasOne
    {
        return $this->hasOne(License::class);
    }

    /** Un abonnement est « à renouveler » dans les 30 jours — même fenêtre que le reste de l'app. */
    public function isRenewalDueSoon(): bool
    {
        return $this->license_expires_at !== null
            && $this->license_expires_at->isFuture()
            && $this->license_expires_at->lessThanOrEqualTo(now()->addDays(30));
    }

    /**
     * Génère et persiste un nouveau jeton de rapport ; retourne le clair, affiché une seule
     * fois à l'appelant (jamais relisible ensuite — seul le hash est conservé en base).
     */
    public function generateReportToken(): string
    {
        $plain = Str::random(64);

        $this->forceFill([
            'report_token_hash' => hash('sha256', $plain),
            'report_token_generated_at' => now(),
            'report_token_last_used_at' => null,
        ])->save();

        return $plain;
    }

    public static function findByReportToken(string $plain): ?self
    {
        return static::query()->where('report_token_hash', hash('sha256', $plain))->first();
    }
}
