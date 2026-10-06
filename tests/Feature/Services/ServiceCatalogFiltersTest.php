<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Pressing;
use App\Models\Service;
use App\Models\ServicePriceHistory;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ServiceCatalogFiltersTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_billing_mode_filter_narrows_the_catalog(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $piece = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'billing_mode' => 'piece']);
        Service::factory()->create(['pressing_id' => $agency->pressing_id, 'billing_mode' => 'kg', 'base_price' => null]);

        $response = $this->actingAs($admin)->getJson('/api/services/catalog?billing_mode=piece');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($piece->id));
        $this->assertCount(1, $ids);
    }

    public function test_only_unavailable_filter_catches_inactive_and_unassigned_services(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $inactive = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'is_active' => false]);
        $unassigned = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'is_active' => true]);
        $available = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'is_active' => true]);
        $agency->services()->attach($available->id, ['is_active' => true]);

        $response = $this->actingAs($admin)->getJson('/api/services/catalog?only_unavailable=1');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($inactive->id));
        $this->assertTrue($ids->contains($unassigned->id));
        $this->assertFalse($ids->contains($available->id));
    }

    public function test_sort_by_base_price_orders_descending(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $cheap = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'base_price' => 500]);
        $expensive = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'base_price' => 5000]);

        $response = $this->actingAs($admin)->getJson('/api/services/catalog?sort=base_price');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->values();
        $this->assertSame($expensive->id, $ids->first());
        $this->assertTrue($ids->search($cheap->id) > $ids->search($expensive->id));
    }

    public function test_price_history_lists_changes_across_the_pressings_catalog(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $agency->pressing_id]);
        ServicePriceHistory::create([
            'service_id' => $service->id, 'field' => 'base_price', 'old_value' => '1000', 'new_value' => '1200',
            'changed_by' => $admin->id, 'changed_at' => now(),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/services/price-history');

        $response->assertOk();
        $response->assertJsonPath('data.0.service.id', $service->id);
        $response->assertJsonPath('data.0.actor.id', $admin->id);
    }

    public function test_price_history_never_leaks_another_pressings_entries(): void
    {
        $this->seedRbac();
        $pressingA = Pressing::factory()->create(['code' => 'TENANT-A']);
        $pressingB = Pressing::factory()->create(['code' => 'TENANT-B']);
        Agency::factory()->create(['pressing_id' => $pressingA->id]);
        $adminA = $this->makeUser('admin');
        $adminA->update(['pressing_id' => $pressingA->id]);
        $foreignService = Service::factory()->create(['pressing_id' => $pressingB->id]);
        ServicePriceHistory::create([
            'service_id' => $foreignService->id, 'field' => 'base_price', 'old_value' => '1000', 'new_value' => '1200',
            'changed_at' => now(),
        ]);

        $response = $this->actingAs($adminA)->getJson('/api/services/price-history');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }
}
