<?php

namespace Database\Factories;

use App\Models\Pressing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Agency>
 */
class AgencyFactory extends Factory
{
    public function definition(): array
    {
        return [
            // Réutilise le premier pressing déjà créé dans le test courant (modèle
            // mono-pressing implicite des tests existants), sinon en crée un — évite
            // de réécrire des centaines de tests pour le pivot multi-tenant (voir
            // CLAUDE.md). Les tests d'isolation croisée créent leurs pressings
            // explicitement et les passent via `->for($pressing)`/state.
            'pressing_id' => fn () => Pressing::query()->value('id') ?? Pressing::factory()->create()->id,
            'code' => strtoupper(fake()->unique()->bothify('AG-###')),
            'name' => 'Pressing '.fake()->city(),
            'city' => fake()->city(),
            'address' => fake()->streetAddress(),
            'phone' => fake()->e164PhoneNumber(),
            'unclaimed_item_threshold_days' => 30,
            'is_active' => true,
        ];
    }
}
