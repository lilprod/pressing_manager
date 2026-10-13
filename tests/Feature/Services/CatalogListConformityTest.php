<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Service;
use App\Models\ServicePriceTier;
use App\Models\TreatmentType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/** Liste « Catalogue articles et tarifs » conforme à la capture (2026-10-13). */
class CatalogListConformityTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_agency_and_minimum_availability_filters_and_scope_details(): void
    {
        $this->seedRbac();
        [$a, $b, $c] = Agency::factory()->count(3)->create();
        $admin = $this->makeUser('admin');
        $everywhere = Service::factory()->create(['name' => 'Chemise']);
        $everywhere->agencies()->attach($a->id, ['is_active' => true, 'price_override' => 1600]);
        $everywhere->agencies()->attach([$b->id, $c->id], ['is_active' => true]);
        $single = Service::factory()->create(['name' => 'Robe longue']);
        $single->agencies()->attach([$b->id => ['is_active' => true]]);

        $inA = $this->actingAs($admin)->getJson("/api/services/catalog?available_in_agency={$a->id}")->json('data');
        $this->assertSame(['Chemise'], collect($inA)->pluck('name')->all());

        $three = $this->actingAs($admin)->getJson('/api/services/catalog?min_agencies=3')->json('data');
        $this->assertSame(['Chemise'], collect($three)->pluck('name')->all());

        $all = collect($this->actingAs($admin)->getJson('/api/services/catalog')->json('data'))->keyBy('name');
        $this->assertSame(1, $all['Chemise']['local_price_count']);
        $this->assertSame($b->name, $all['Robe longue']['single_agency_name']);
        $this->assertNull($all['Chemise']['single_agency_name']);
    }

    public function test_kilo_articles_expose_a_per_kilo_price_per_treatment(): void
    {
        $this->seedRbac();
        Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $express = TreatmentType::factory()->create(['code' => 'express', 'price_ratio' => 1.5]);
        $iron = TreatmentType::factory()->create(['code' => 'repassage', 'price_ratio' => 0.5]);
        $linen = Service::factory()->create(['billing_mode' => 'kg', 'base_price' => null]);
        ServicePriceTier::create(['service_id' => $linen->id, 'weight_min' => 0, 'weight_max' => null, 'price_per_kg' => 2200, 'treatment_prices' => [(string) $express->id => 3200]]);

        $row = $this->actingAs($admin)->getJson('/api/services/catalog')->json('data.0');
        $this->assertSame(3200, $row['treatment_prices_per_kg']['express']);
        $this->assertSame(1100, $row['treatment_prices_per_kg']['repassage']);
    }
}
