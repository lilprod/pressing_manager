<?php

namespace Tests\Concerns;

use App\Models\PlatformPlan;
use App\Models\PlatformUser;
use App\Services\TotpService;
use Illuminate\Support\Facades\Hash;

trait SeedsPlatform
{
    /** Utilisateur plateforme déjà avec MFA confirmée — pour les tests qui ne testent pas l'enrôlement. */
    protected function makePlatformUser(string $password = 'password'): PlatformUser
    {
        $secret = app(TotpService::class)->generateSecret();

        return PlatformUser::create([
            'name' => 'Admin Plateforme',
            'email' => 'platform-'.uniqid().'@spark-pressing.test',
            'password' => Hash::make($password),
            'totp_secret' => $secret,
            'totp_enabled_at' => now(),
            'is_active' => true,
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
