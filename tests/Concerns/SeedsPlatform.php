<?php

namespace Tests\Concerns;

use App\Models\PlatformPlan;
use App\Models\PlatformRole;
use App\Models\PlatformUser;
use App\Models\Pressing;
use App\Services\TotpService;
use Illuminate\Support\Facades\Hash;

trait SeedsPlatform
{
    /** Utilisateur plateforme déjà avec MFA confirmée, rôle Superadmin (accès illimité) par
     * défaut — pour les tests qui ne testent pas l'enrôlement ni le périmètre par pressing. */
    protected function makePlatformUser(string $password = 'password', string $roleSlug = 'superadmin'): PlatformUser
    {
        $secret = app(TotpService::class)->generateSecret();
        $role = PlatformRole::where('slug', $roleSlug)->firstOrFail();

        return PlatformUser::create([
            'name' => 'Admin Plateforme',
            'email' => 'platform-'.uniqid().'@spark-pressing.test',
            'password' => Hash::make($password),
            'platform_role_id' => $role->id,
            'totp_secret' => $secret,
            'totp_enabled_at' => now(),
            'is_active' => true,
        ]);
    }

    /** Utilisateur transverse (non-superadmin) affecté à un sous-ensemble de pressings. */
    protected function makeTransversePlatformUser(array $pressingIds, string $roleSlug = 'admin_transverse', string $password = 'password'): PlatformUser
    {
        $user = $this->makePlatformUser($password, $roleSlug);
        $user->pressings()->sync($pressingIds);

        return $user;
    }

    protected function makePressing(string $name = 'Éclat Royal', ?string $code = null): Pressing
    {
        return Pressing::create([
            'name' => $name,
            'code' => $code ?? strtoupper(uniqid('P-')),
            'platform_plan_id' => $this->makePlatformPlan()->id,
        ]);
    }

    protected function currentTotpCode(PlatformUser $user): string
    {
        return app(TotpService::class)->currentCode($user->totp_secret);
    }

    protected function makePlatformPlan(string $slug = 'pro'): PlatformPlan
    {
        return PlatformPlan::firstOrCreate(['slug' => $slug], ['name' => ucfirst($slug), 'is_active' => true]);
    }
}
