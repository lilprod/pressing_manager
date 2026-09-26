<?php

namespace Tests\Feature\Hr;

use App\Console\Commands\MarkAbsences;
use App\Models\Agency;
use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\OrderItem;
use App\Models\OrderItemStatusHistory;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class HrTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_clocking_in_without_a_shift_is_marked_present(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/attendances/clock-in');

        $response->assertCreated();
        $response->assertJsonPath('status', 'present');
        $response->assertJsonPath('agency_id', $agency->id);
    }

    public function test_a_global_user_must_supply_agency_id_to_clock_in(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager');

        $missing = $this->actingAs($manager)->postJson('/api/attendances/clock-in');
        $missing->assertStatus(422);

        $withAgency = $this->actingAs($manager)->postJson('/api/attendances/clock-in', ['agency_id' => $agency->id]);
        $withAgency->assertCreated();
        $withAgency->assertJsonPath('agency_id', $agency->id);
    }

    public function test_a_global_user_must_supply_agency_id_to_plan_a_shift(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager');
        $technicien = $this->makeUser('technicien', $agency);

        $missing = $this->actingAs($manager)->postJson('/api/shifts', [
            'user_id' => $technicien->id,
            'starts_at' => now()->addDay()->setTime(8, 0),
            'ends_at' => now()->addDay()->setTime(16, 0),
        ]);
        $missing->assertStatus(422);

        $withAgency = $this->actingAs($manager)->postJson('/api/shifts', [
            'agency_id' => $agency->id,
            'user_id' => $technicien->id,
            'starts_at' => now()->addDay()->setTime(8, 0),
            'ends_at' => now()->addDay()->setTime(16, 0),
        ]);
        $withAgency->assertCreated();
    }

    public function test_clocking_in_late_against_a_shift_is_marked_retard(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        Shift::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $technicien->id,
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addHours(7),
        ]);

        $response = $this->actingAs($technicien)->postJson('/api/attendances/clock-in');

        $response->assertCreated();
        $response->assertJsonPath('status', 'retard');
    }

    public function test_cannot_clock_in_twice_without_clocking_out(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $this->actingAs($technicien)->postJson('/api/attendances/clock-in')->assertCreated();

        $response = $this->actingAs($technicien)->postJson('/api/attendances/clock-in');

        $response->assertStatus(422);
    }

    public function test_clocking_out_closes_the_open_attendance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $this->actingAs($technicien)->postJson('/api/attendances/clock-in')->assertCreated();

        $response = $this->actingAs($technicien)->postJson('/api/attendances/clock-out');

        $response->assertOk();
        $this->assertNotNull($response->json('clock_out'));
    }

    public function test_clocking_out_without_an_open_attendance_fails(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/attendances/clock-out');

        $response->assertStatus(422);
    }

    public function test_a_manager_can_plan_a_shift_for_their_agency_staff(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($manager)->postJson('/api/shifts', [
            'user_id' => $technicien->id,
            'starts_at' => now()->addDay()->setTime(8, 0),
            'ends_at' => now()->addDay()->setTime(16, 0),
        ]);

        $response->assertCreated();
        $response->assertJsonPath('user_id', $technicien->id);
    }

    public function test_cannot_plan_a_shift_for_a_user_from_another_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $managerA = $this->makeUser('manager', $agencyA);
        $technicienB = $this->makeUser('technicien', $agencyB);

        $response = $this->actingAs($managerA)->postJson('/api/shifts', [
            'user_id' => $technicienB->id,
            'starts_at' => now()->addDay()->setTime(8, 0),
            'ends_at' => now()->addDay()->setTime(16, 0),
        ]);

        $response->assertStatus(403);
    }

    public function test_a_technicien_cannot_plan_shifts(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/shifts', [
            'user_id' => $technicien->id,
            'starts_at' => now()->addDay()->setTime(8, 0),
            'ends_at' => now()->addDay()->setTime(16, 0),
        ]);

        $response->assertStatus(403);
    }

    public function test_mark_absences_command_flags_shifts_without_any_attendance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        // Créneau entièrement hier, quelle que soit l'heure à laquelle le test s'exécute
        // aujourd'hui — évite toute dépendance à l'horloge murale (--date par défaut = hier).
        $shift = Shift::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $technicien->id,
            'starts_at' => now()->subDay()->setTime(8, 0),
            'ends_at' => now()->subDay()->setTime(16, 0),
        ]);

        $this->artisan(MarkAbsences::class)->assertSuccessful();

        $this->assertDatabaseHas('attendances', [
            'shift_id' => $shift->id,
            'status' => 'absent',
        ]);
    }

    public function test_mark_absences_skips_shifts_that_already_have_an_attendance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);
        $shift = Shift::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $technicien->id,
            'starts_at' => now()->subDay()->setTime(8, 0),
            'ends_at' => now()->subDay()->setTime(16, 0),
        ]);
        Attendance::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $technicien->id,
            'shift_id' => $shift->id,
            'status' => 'present',
        ]);

        $this->artisan(MarkAbsences::class)->assertSuccessful();

        $this->assertDatabaseCount('attendances', 1);
    }

    public function test_performance_report_counts_items_processed_and_deliveries_completed(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager', $agency);
        $technicien = $this->makeUser('technicien', $agency);
        $livreur = $this->makeUser('livreur', $agency);

        $item = OrderItem::factory()->create(['agency_id' => $agency->id]);
        OrderItemStatusHistory::create([
            'order_item_id' => $item->id,
            'from_status' => 'controle_qualite',
            'to_status' => 'pret',
            'changed_by' => $technicien->id,
            'changed_at' => now(),
        ]);

        Delivery::factory()->create([
            'agency_id' => $agency->id,
            'livreur_id' => $livreur->id,
            'status' => 'livree',
            'delivered_at' => now(),
        ]);

        $response = $this->actingAs($manager)->getJson('/api/hr/performance?agency_id='.$agency->id);

        $response->assertOk();
        $rows = collect($response->json());
        $this->assertSame(1, $rows->firstWhere('user_id', $technicien->id)['items_processed']);
        $this->assertSame(1, $rows->firstWhere('user_id', $livreur->id)['deliveries_completed']);
    }

    public function test_performance_report_requires_hr_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->getJson('/api/hr/performance?agency_id='.$agency->id);

        $response->assertStatus(403);
    }
}
