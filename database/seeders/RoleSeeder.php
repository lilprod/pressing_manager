<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public const ROLES = [
        ['slug' => 'admin', 'name' => 'Administrateur', 'scope' => 'global'],
        ['slug' => 'manager', 'name' => 'Manager', 'scope' => 'flexible'],
        ['slug' => 'accueil', 'name' => 'Accueil', 'scope' => 'agency'],
        ['slug' => 'technicien', 'name' => 'Technicien', 'scope' => 'agency'],
        ['slug' => 'livreur', 'name' => 'Livreur', 'scope' => 'agency'],
        ['slug' => 'client', 'name' => 'Client', 'scope' => 'agency'],
    ];

    public function run(): void
    {
        foreach (self::ROLES as $role) {
            Role::query()->updateOrCreate(['slug' => $role['slug']], $role);
        }
    }
}
