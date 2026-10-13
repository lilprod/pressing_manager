<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Client;
use App\Models\IntakeCondition;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/** Fiche article (audit Figma du 2026-10-13) : disponibilité par agence, états acceptés. */
class ServiceEditExtensionsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_availability_lists_and_updates_every_agency(): void
    {
        $this->seedRbac();
        $a = Agency::factory()->create(['name' => 'Alpha']);
        $b = Agency::factory()->create(['name' => 'Beta', 'pressing_id' => $a->pressing_id]);
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $a->pressing_id]);

        $this->actingAs($admin)->putJson("/api/services/{$service->id}/availability", ['agencies' => [
            ['agency_id' => $a->id, 'is_active' => true, 'price_override' => 1500],
            ['agency_id' => $b->id, 'is_active' => false, 'price_override' => null],
        ]])->assertOk();

        $rows = collect($this->actingAs($admin)->getJson("/api/services/{$service->id}/availability")->json())->keyBy('agency_id');
        $this->assertTrue($rows[$a->id]['is_active']);
        $this->assertSame(1500, $rows[$a->id]['price_override']);
        $this->assertFalse($rows[$b->id]['is_active']);
    }

    public function test_accepted_conditions_are_saved_and_enforced_at_the_counter(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $accueil = $this->makeUser('accueil', $agency);
        $ok = IntakeCondition::create(['code' => 'tache', 'label' => 'Tache', 'is_active' => true]);
        $refused = IntakeCondition::create(['code' => 'dechirure', 'label' => 'Déchirure', 'is_active' => true]);
        $service = Service::factory()->create(['base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $this->actingAs($admin)->patchJson("/api/services/{$service->id}", ['accepted_condition_ids' => [$ok->id]])->assertOk();
        $this->assertSame([$ok->id], $service->acceptedConditions()->pluck('intake_conditions.id')->all());

        $client = Client::factory()->for($agency, 'agency')->create();
        $payload = fn ($ids) => ['client_id' => $client->id, 'items' => [['service_id' => $service->id, 'quantity' => 1, 'intake_condition_ids' => $ids]]];
        $this->actingAs($accueil)->postJson('/api/orders', $payload([$refused->id]))->assertStatus(422);
        $this->actingAs($accueil)->postJson('/api/orders', $payload([$ok->id]))->assertCreated();
    }
}
