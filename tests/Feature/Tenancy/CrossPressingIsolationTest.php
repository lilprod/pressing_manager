<?php

namespace Tests\Feature\Tenancy;

use App\Models\Agency;
use App\Models\AppSetting;
use App\Models\Client;
use App\Models\Order;
use App\Models\Pressing;
use App\Models\Role;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Pivot multi-tenant (CLAUDE.md « Pivot multi-tenant ») : le test le plus
 * important de ce chantier. Deux pressings A et B, chacun avec sa propre
 * agence, son propre manager (rôle global, agency_id=null) et ses propres
 * données — vérifie qu'un utilisateur global de A ne voit/ne peut jamais
 * atteindre quoi que ce soit appartenant à B, même en devinant un id, et que
 * les catalogues "globalement uniques" d'avant le pivot (codes agence/service)
 * sont désormais indépendants par pressing.
 */
class CrossPressingIsolationTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private Pressing $pressingA;

    private Pressing $pressingB;

    private Agency $agencyA;

    private Agency $agencyB;

    private User $managerA;

    private User $managerB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedRbac();

        $this->pressingA = Pressing::factory()->create(['code' => 'TENANT-A']);
        $this->pressingB = Pressing::factory()->create(['code' => 'TENANT-B']);

        $this->agencyA = Agency::factory()->create(['pressing_id' => $this->pressingA->id, 'code' => 'AG-01']);
        $this->agencyB = Agency::factory()->create(['pressing_id' => $this->pressingB->id, 'code' => 'AG-01']);

        $adminRoleId = Role::where('slug', 'admin')->value('id');

        $this->managerA = User::factory()->create([
            'pressing_id' => $this->pressingA->id,
            'agency_id' => null,
            'role_id' => $adminRoleId,
        ]);
        $this->managerB = User::factory()->create([
            'pressing_id' => $this->pressingB->id,
            'agency_id' => null,
            'role_id' => $adminRoleId,
        ]);
    }

    public function test_agency_codes_can_repeat_across_pressings(): void
    {
        // Les deux agences ont déjà été créées avec le même code "AG-01" dans setUp() —
        // si l'unicité composite [pressing_id, code] n'était pas en place, la seconde
        // création aurait levé une contrainte d'unicité avant même d'atteindre ce test.
        $this->assertSame('AG-01', $this->agencyA->code);
        $this->assertSame('AG-01', $this->agencyB->code);
        $this->assertNotSame($this->agencyA->id, $this->agencyB->id);
    }

    public function test_a_global_user_never_lists_clients_from_another_pressing(): void
    {
        $clientA = Client::factory()->create(['agency_id' => $this->agencyA->id, 'first_name' => 'Aminata']);
        $clientB = Client::factory()->create(['agency_id' => $this->agencyB->id, 'first_name' => 'Boubacar']);

        $response = $this->actingAs($this->managerA)->getJson('/api/clients?per_page=100');
        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($clientA->id));
        $this->assertFalse($ids->contains($clientB->id));
    }

    public function test_a_global_user_never_lists_orders_from_another_pressing(): void
    {
        $orderA = Order::factory()->create(['agency_id' => $this->agencyA->id]);
        $orderB = Order::factory()->create(['agency_id' => $this->agencyB->id]);

        $response = $this->actingAs($this->managerA)->getJson('/api/orders?per_page=100');
        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($orderA->id));
        $this->assertFalse($ids->contains($orderB->id));
    }

    public function test_fetching_a_single_order_from_another_pressing_is_forbidden(): void
    {
        $orderB = Order::factory()->create(['agency_id' => $this->agencyB->id]);

        $response = $this->actingAs($this->managerA)->getJson("/api/orders/{$orderB->id}");

        $response->assertStatus(403);
    }

    public function test_fetching_a_single_client_from_another_pressing_is_forbidden(): void
    {
        $clientB = Client::factory()->create(['agency_id' => $this->agencyB->id]);

        $response = $this->actingAs($this->managerA)->getJson("/api/clients/{$clientB->id}");

        $response->assertStatus(403);
    }

    public function test_a_global_user_cannot_explicitly_request_another_pressings_agency_id(): void
    {
        $response = $this->actingAs($this->managerA)->getJson("/api/clients?agency_id={$this->agencyB->id}");

        $response->assertStatus(403);
    }

    public function test_service_catalogs_are_scoped_by_pressing(): void
    {
        $serviceA = Service::factory()->create(['pressing_id' => $this->pressingA->id, 'code' => 'SVC-01']);
        $serviceB = Service::factory()->create(['pressing_id' => $this->pressingB->id, 'code' => 'SVC-01']);

        $this->assertNotSame($serviceA->id, $serviceB->id);

        $response = $this->actingAs($this->managerA)->getJson('/api/services/catalog?per_page=100');
        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($serviceA->id));
        $this->assertFalse($ids->contains($serviceB->id));
    }

    public function test_app_settings_are_independent_per_pressing(): void
    {
        AppSetting::current($this->pressingA->id)->update(['pressing_name' => 'Pressing A']);
        AppSetting::current($this->pressingB->id)->update(['pressing_name' => 'Pressing B']);

        $this->assertSame('Pressing A', AppSetting::current($this->pressingA->id)->refresh()->pressing_name);
        $this->assertSame('Pressing B', AppSetting::current($this->pressingB->id)->refresh()->pressing_name);
    }

    public function test_a_global_user_cannot_create_a_client_in_another_pressings_agency(): void
    {
        $response = $this->actingAs($this->managerA)->postJson('/api/clients', [
            'first_name' => 'Intrus',
            'last_name' => 'Test',
            'phone' => '+221700000000',
            'agency_id' => $this->agencyB->id,
        ]);

        $response->assertStatus(403);
    }
}
