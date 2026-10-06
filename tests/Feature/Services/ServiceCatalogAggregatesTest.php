<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Service;
use App\Models\ServicePriceHistory;
use App\Models\TreatmentType;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ServiceCatalogAggregatesTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_catalog_reports_treatment_prices_for_piece_billed_services(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'billing_mode' => 'piece', 'base_price' => 1000]);
        TreatmentType::create(['pressing_id' => $agency->pressing_id, 'code' => 'express', 'name' => 'Express', 'price_ratio' => 1.5, 'is_active' => true]);
        TreatmentType::create(['pressing_id' => $agency->pressing_id, 'code' => 'inactive', 'name' => 'Inactif', 'price_ratio' => 2, 'is_active' => false]);

        $response = $this->actingAs($admin)->getJson('/api/services/catalog');

        $response->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', $service->id);
        $this->assertSame(1500, $row['treatment_prices']['express']);
        $this->assertArrayNotHasKey('inactive', $row['treatment_prices']);
    }

    public function test_catalog_omits_treatment_prices_for_kg_billed_services(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'billing_mode' => 'kg', 'base_price' => null]);
        TreatmentType::create(['pressing_id' => $agency->pressing_id, 'code' => 'express', 'name' => 'Express', 'price_ratio' => 1.5, 'is_active' => true]);

        $response = $this->actingAs($admin)->getJson('/api/services/catalog');

        $row = collect($response->json('data'))->firstWhere('id', $service->id);
        $this->assertNull($row['treatment_prices']);
    }

    public function test_catalog_reports_real_availability_counts(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->for($agencyA->pressing, 'pressing')->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $agencyA->pressing_id]);
        $agencyA->services()->attach($service->id, ['is_active' => true]);
        // Pas de ligne pour agencyB : le service n'y est pas disponible.

        $response = $this->actingAs($admin)->getJson('/api/services/catalog');

        $row = collect($response->json('data'))->firstWhere('id', $service->id);
        $this->assertSame(1, $row['available_agencies_count']);
        $this->assertSame(2, $row['total_agencies_count']);
    }

    public function test_stats_reports_new_services_this_month_and_catalog_updated_at(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        Service::factory()->create(['pressing_id' => $agency->pressing_id, 'created_at' => now()]);
        Service::factory()->create(['pressing_id' => $agency->pressing_id, 'created_at' => now()->subMonths(2)]);

        $response = $this->actingAs($admin)->getJson('/api/services/stats');

        $response->assertOk();
        $response->assertJsonPath('created_this_month_count', 1);
        $this->assertNotNull($response->json('catalog_updated_at'));
    }

    public function test_stats_falls_back_to_current_price_when_no_history_exists_before_the_cutoff(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        Service::factory()->create(['pressing_id' => $agency->pressing_id, 'billing_mode' => 'piece', 'base_price' => 2000]);

        $response = $this->actingAs($admin)->getJson('/api/services/stats');

        $response->assertOk();
        $this->assertSame($response->json('average_base_price'), $response->json('average_base_price_30d_ago'));
    }

    public function test_stats_uses_the_historical_price_in_effect_30_days_ago(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'billing_mode' => 'piece', 'base_price' => 3000]);
        ServicePriceHistory::create([
            'service_id' => $service->id, 'field' => 'base_price', 'old_value' => '1000', 'new_value' => '2000',
            'changed_at' => now()->subDays(40),
        ]);
        ServicePriceHistory::create([
            'service_id' => $service->id, 'field' => 'base_price', 'old_value' => '2000', 'new_value' => '3000',
            'changed_at' => now()->subDays(5),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/services/stats');

        $response->assertOk();
        $response->assertJsonPath('average_base_price', 3000);
        $response->assertJsonPath('average_base_price_30d_ago', 2000);
    }
}
