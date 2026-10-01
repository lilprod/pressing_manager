<?php

namespace Tests\Feature\TreatmentTypes;

use App\Models\TreatmentType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class TreatmentTypeTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_list_create_and_update_a_treatment_type(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $created = $this->actingAs($admin)->postJson('/api/treatment-types', [
            'code' => 'pressing_vapeur',
            'name' => 'Pressing vapeur',
            'price_ratio' => 1.25,
        ]);
        $created->assertCreated();
        $created->assertJsonPath('name', 'Pressing vapeur');

        $updated = $this->actingAs($admin)->patchJson("/api/treatment-types/{$created->json('id')}", [
            'price_ratio' => 1.30,
        ]);
        $updated->assertOk();
        $updated->assertJsonPath('price_ratio', 1.3);

        $index = $this->actingAs($admin)->getJson('/api/treatment-types');
        $index->assertOk();
        $this->assertContains('Pressing vapeur', $index->json('*.name'));
    }

    public function test_creating_a_treatment_type_requires_the_services_manage_permission(): void
    {
        $this->seedRbac();
        $agency = \App\Models\Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/treatment-types', [
            'code' => 'pressing_vapeur',
            'name' => 'Pressing vapeur',
            'price_ratio' => 1.25,
        ]);

        $response->assertStatus(403);
    }

    public function test_two_treatment_types_cannot_share_the_same_code(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        TreatmentType::factory()->create(['code' => 'express']);

        $response = $this->actingAs($admin)->postJson('/api/treatment-types', [
            'code' => 'express',
            'name' => 'Express doublon',
            'price_ratio' => 1.5,
        ]);

        $response->assertStatus(422);
    }
}
