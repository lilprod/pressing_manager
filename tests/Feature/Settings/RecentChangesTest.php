<?php

namespace Tests\Feature\Settings;

use App\Models\Agency;
use App\Models\AppSetting;
use App\Models\Order;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\Concerns\SeedsTenant;
use Tests\TestCase;

/**
 * Panneau « Dernières modifications » du hub Paramètres (CLAUDE.md « Hub
 * Paramètres ») : GET /settings/recent-changes agrège Agency + AppSetting
 * (agency_id toujours null pour ce dernier, d'où l'endpoint dédié plutôt que
 * AuditLogController::index()).
 */
class RecentChangesTest extends TestCase
{
    use RefreshDatabase, SeedsRbac, SeedsTenant;

    public function test_it_requires_the_agencies_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $user = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($user)->getJson('/api/settings/recent-changes');

        $response->assertStatus(403);
    }

    public function test_it_surfaces_agency_and_app_setting_changes(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $agency = Agency::factory()->create();
        $agency->update(['name' => 'Agence renommée']);

        $settings = AppSetting::current($this->pressingId());
        $settings->update(['pressing_name' => 'Nouveau nom']);

        $response = $this->actingAs($admin)->getJson('/api/settings/recent-changes');

        $response->assertOk();
        $types = collect($response->json())->pluck('auditable_type');
        $this->assertContains('Agency', $types);
        $this->assertContains('AppSetting', $types);
    }

    public function test_it_is_limited_to_five_entries(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        foreach (range(1, 7) as $i) {
            Agency::factory()->create(['code' => "AG-{$i}"]);
        }

        $response = $this->actingAs($admin)->getJson('/api/settings/recent-changes');

        $response->assertOk();
        $this->assertCount(5, $response->json());
    }

    public function test_it_never_shows_unrelated_audited_types_sharing_the_same_agency(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $agency = Agency::factory()->create();
        // Order est aussi journalisé (trait Auditable) et partage agency_id avec Agency —
        // un whereIn('agency_id', ...) naïf (sans filtrer auditable_type) les confondrait.
        $order = Order::factory()->create(['agency_id' => $agency->id]);

        $response = $this->actingAs($admin)->getJson('/api/settings/recent-changes');

        $response->assertOk();
        $types = collect($response->json())->pluck('auditable_type');
        $this->assertNotContains('Order', $types);
    }

    public function test_it_never_shows_another_pressings_changes(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $otherPressing = Pressing::factory()->create();
        $otherAgency = Agency::factory()->create(['pressing_id' => $otherPressing->id]);
        $otherAgency->update(['name' => 'Agence étrangère renommée']);

        $response = $this->actingAs($admin)->getJson('/api/settings/recent-changes');

        $response->assertOk();
        $entries = collect($response->json())
            ->filter(fn ($entry) => $entry['auditable_type'] === 'Agency')
            ->pluck('auditable_id');
        $this->assertFalse($entries->contains($otherAgency->id));
    }
}
