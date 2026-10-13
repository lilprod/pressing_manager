<?php

namespace Tests\Feature\Platform;

use App\Models\Agency;
use App\Models\PlatformIncident;
use App\Models\PlatformRole;
use App\Models\PlatformUser;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Console superadmin (audit Figma du 2026-10-13) : agences cross-tenant, incidents, licences, registre enrichi. */
class PlatformOperationsTest extends TestCase
{
    use RefreshDatabase;

    private function superadmin(): PlatformUser
    {
        return PlatformUser::factory()->create(['platform_role_id' => PlatformRole::where('slug', 'superadmin')->value('id')]);
    }

    public function test_agencies_are_listed_created_and_updated_across_pressings(): void
    {
        $a = Pressing::factory()->create(['name' => 'Alpha']);
        $b = Pressing::factory()->create(['name' => 'Beta']);
        Agency::factory()->create(['pressing_id' => $a->id, 'name' => 'Akwa']);
        Agency::factory()->create(['pressing_id' => $b->id, 'name' => 'Bonapriso']);
        $admin = $this->superadmin();

        $list = $this->actingAs($admin, 'platform')->getJson('/api/platform/agencies')->assertOk();
        $this->assertGreaterThanOrEqual(2, $list->json('total'));
        $this->assertSame(['Bonapriso'], collect($this->actingAs($admin, 'platform')->getJson("/api/platform/agencies?pressing_id={$b->id}")->json('data'))->pluck('name')->all());

        $created = $this->actingAs($admin, 'platform')->postJson('/api/platform/agencies', [
            'pressing_id' => $a->id, 'code' => 'AKW2', 'name' => 'Akwa Nord', 'opens_at' => '07:30', 'closes_at' => '19:00',
            'opening_days' => [1, 2, 3, 4, 5, 6], 'order_number_prefix' => 'AKW-', 'standard_delay_hours' => 48,
            'email' => 'akwa@example.test',
        ])->assertCreated();
        $this->assertSame('akwa@example.test', $created->json('email'));
        $this->assertSame(0, $created->json('local_price_overrides'));
        $this->assertArrayHasKey('manager_name', $created->json());
        $this->assertSame('AKW-', $created->json('settings.order_number_prefix'));
        $this->assertSame([1, 2, 3, 4, 5, 6], $created->json('opening_days'));

        $this->actingAs($admin, 'platform')->patchJson('/api/platform/agencies/'.$created->json('id'), ['is_active' => false, 'washer_step_enabled' => false])
            ->assertOk()->assertJson(['is_active' => false, 'settings' => ['washer_step_enabled' => false]]);
    }

    public function test_transverse_user_only_sees_assigned_pressings_agencies(): void
    {
        $mine = Pressing::factory()->create();
        $other = Pressing::factory()->create();
        Agency::factory()->create(['pressing_id' => $mine->id]);
        $foreign = Agency::factory()->create(['pressing_id' => $other->id]);
        $user = PlatformUser::factory()->create(['platform_role_id' => PlatformRole::where('slug', 'admin_transverse')->value('id')]);
        $user->pressings()->attach($mine->id);

        $ids = collect($this->actingAs($user, 'platform')->getJson('/api/platform/agencies')->json('data'))->pluck('pressing.id')->unique()->all();
        $this->assertSame([$mine->id], array_values($ids));
        $this->actingAs($user, 'platform')->patchJson("/api/platform/agencies/{$foreign->id}", ['name' => 'X'])->assertForbidden();
    }

    public function test_incidents_feed_the_dashboard_and_the_registry(): void
    {
        $pressing = Pressing::factory()->create();
        $admin = $this->superadmin();

        $incident = $this->actingAs($admin, 'platform')->postJson('/api/platform/incidents', [
            'pressing_id' => $pressing->id, 'title' => 'Synchronisation interrompue', 'priority' => 'P1',
        ])->assertCreated()->json();

        $dashboard = $this->actingAs($admin, 'platform')->getJson('/api/platform/dashboard')->assertOk();
        $dashboard->assertJsonPath('incidents.open', 1)->assertJsonPath('incidents.high_priority', 1);
        $row = collect($this->actingAs($admin, 'platform')->getJson('/api/platform/pressings')->json('data'))->firstWhere('id', $pressing->id);
        $this->assertSame(1, $row['open_incidents_count']);

        $this->actingAs($admin, 'platform')->patchJson("/api/platform/incidents/{$incident['id']}", ['status' => 'resolved', 'resolution' => 'Relancé'])->assertOk();
        $this->assertNotNull(PlatformIncident::find($incident['id'])->resolved_at);
        $this->actingAs($admin, 'platform')->getJson('/api/platform/dashboard')->assertJsonPath('incidents.open', 0);
    }

    public function test_licenses_list_and_pressings_export(): void
    {
        Pressing::factory()->create(['name' => 'Éclat Royal']);
        $admin = $this->superadmin();

        $this->actingAs($admin, 'platform')->getJson('/api/platform/licenses')->assertOk()->assertJsonStructure([['pressing', 'plan', 'expires_at', 'days_remaining', 'last_payment']]);
        $csv = $this->actingAs($admin, 'platform')->get('/api/platform/pressings/export')->assertOk();
        $this->assertStringContainsString('Éclat Royal', $csv->streamedContent());
    }
}
