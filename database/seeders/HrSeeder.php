<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Database\Seeder;

class HrSeeder extends Seeder
{
    /**
     * Un créneau du jour par membre du personnel d'agence, pour que la page RH
     * ait des données de démonstration dès la connexion.
     */
    public function run(): void
    {
        foreach (Agency::all() as $agency) {
            $staff = User::query()
                ->where('agency_id', $agency->id)
                ->whereHas('role', fn ($query) => $query->whereIn('slug', ['accueil', 'technicien', 'livreur']))
                ->get();

            foreach ($staff as $user) {
                Shift::query()->firstOrCreate([
                    'agency_id' => $agency->id,
                    'user_id' => $user->id,
                    'starts_at' => now()->setTime(8, 0),
                ], [
                    'ends_at' => now()->setTime(16, 0),
                ]);
            }
        }
    }
}
