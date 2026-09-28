<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::query()->get()->keyBy('slug');
        $agencies = Agency::query()->get();

        $this->createUser('Admin Système', 'admin@pressing.tg', $roles['admin'], null);
        $this->createUser('Manager Général', 'manager@pressing.tg', $roles['manager'], null);

        foreach ($agencies as $agency) {
            $slug = str($agency->code)->lower()->slug()->value();
            $this->createUser("Accueil {$agency->name}", "accueil.{$slug}@pressing.tg", $roles['accueil'], $agency->id);
            $this->createUser("Technicien {$agency->name}", "technicien.{$slug}@pressing.tg", $roles['technicien'], $agency->id);
            $this->createUser("Livreur {$agency->name}", "livreur.{$slug}@pressing.tg", $roles['livreur'], $agency->id);
        }
    }

    private function createUser(string $name, string $email, Role $role, ?int $agencyId): User
    {
        return User::query()->updateOrCreate(['email' => $email], [
            'name' => $name,
            'phone' => '+228 90 00 00 00',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'agency_id' => $agencyId,
            'is_active' => true,
            'must_change_password' => false,
            'password_changed_at' => now(),
            'email_verified_at' => now(),
        ]);
    }
}
