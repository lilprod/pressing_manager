<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Client;
use Illuminate\Database\Seeder;

class ClientSeeder extends Seeder
{
    public function run(): void
    {
        foreach (Agency::all() as $agency) {
            Client::factory()->count(10)->for($agency, 'agency')->create();
        }
    }
}
