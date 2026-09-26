<?php

namespace Tests\Concerns;

use App\Models\Agency;
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
