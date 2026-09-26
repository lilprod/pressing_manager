<?php

namespace Tests\Concerns;

use App\Models\Agency;
use App\Models\License;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

trait SeedsRbac
{
    protected function seedRbac(): void
    {
        $this->seed(RoleSeeder::class);
        $this->seed(PermissionSeeder::class);
        // Requis par le middleware CheckLicenseStatus sur toutes les routes protégées.
        if (License::query()->doesntExist()) {
            License::create([
                'plan' => 'annuel',
                'starts_at' => now(),
                'expires_at' => now()->addYear(),
                'grace_period_days' => 7,
                'status' => 'active',
            ]);
        }
    }

    protected function makeUser(string $roleSlug, ?Agency $agency = null): User
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();

        return User::factory()->create([
            'role_id' => $role->id,
            'agency_id' => $role->isGlobal() ? null : $agency?->id,
        ]);
    }
}
