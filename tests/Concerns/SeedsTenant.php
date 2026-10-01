<?php

namespace Tests\Concerns;

use App\Models\Pressing;

/**
 * Pivot multi-tenant (CLAUDE.md) : la plupart des tests existants ont été écrits
 * sous l'hypothèse mono-pressing implicite et n'ont pas besoin d'en créer un
 * explicitement — les factories (Agency/User/Service/TreatmentType) réutilisent
 * déjà automatiquement le premier pressing du test. Ce trait sert aux rares cas
 * où un test a besoin de nommer explicitement ce pressing (ex. `AppSetting::current()`,
 * qui ne peut plus deviner de pressing tout seul) ou d'en créer plusieurs
 * explicitement (tests d'isolation croisée).
 */
trait SeedsTenant
{
    protected function pressingId(): int
    {
        return Pressing::query()->value('id') ?? Pressing::factory()->create()->id;
    }
}
