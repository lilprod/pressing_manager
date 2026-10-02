<?php

namespace Tests\Feature\Settings;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Écran « Paramètres opérationnels » (CLAUDE.md « Opérationnel »), AgencySetting
 * singleton 1:1 par agence — même pattern que AppSetting::current().
 */
class AgencySettingsTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_for_agency_auto_creates_a_singleton_with_safe_defaults(): void
    {
        $agency = Agency::factory()->create();

        $settings = AgencySetting::forAgency($agency->id);

        $this->assertSame($agency->id, $settings->agency_id);
        // block_pickup_if_unpaid=true préserve le comportement historique (toujours
        // bloqué) tant que personne n'a explicitement choisi de l'assouplir — voir
        // PickupService et CLAUDE.md « Opérationnel ».
        $this->assertTrue($settings->block_pickup_if_unpaid);
        $this->assertTrue($settings->washer_step_enabled);
        $this->assertTrue($settings->sorter_step_enabled);
        $this->assertSame(4, $settings->order_number_padding);

        // Deuxième appel : pas de doublon, même ligne.
        $this->assertSame($settings->id, AgencySetting::forAgency($agency->id)->id);
    }

    public function test_show_is_accessible_to_any_staff_of_the_agency_not_only_agencies_manage(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->getJson("/api/agencies/{$agency->id}/settings");

        $response->assertOk();
        $response->assertJsonPath('agency_id', $agency->id);
    }

    public function test_show_rejects_a_user_from_another_agency(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $otherAgency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $otherAgency);

        $response = $this->actingAs($accueil)->getJson("/api/agencies/{$agency->id}/settings");

        $response->assertStatus(403);
    }

    public function test_update_requires_the_agencies_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->patchJson("/api/agencies/{$agency->id}/settings", [
            'block_pickup_if_unpaid' => false,
        ]);

        $response->assertStatus(403);
    }

    public function test_an_admin_can_update_the_agency_settings(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->patchJson("/api/agencies/{$agency->id}/settings", [
            'order_number_prefix' => 'PL-',
            'order_number_padding' => 5,
            'minimum_order_amount' => 2000,
            'block_pickup_if_unpaid' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('order_number_prefix', 'PL-');
        $response->assertJsonPath('minimum_order_amount', 2000);
        $response->assertJsonPath('block_pickup_if_unpaid', false);
        $this->assertDatabaseHas('agency_settings', ['agency_id' => $agency->id, 'order_number_prefix' => 'PL-']);
    }

    /** Couche d'affichage seule : ne touche jamais order_number brut (verrouillage de
     * séquence inchangé dans OrderNumberGenerator). */
    public function test_format_order_number_applies_prefix_suffix_and_padding_without_touching_the_raw_column(): void
    {
        $agency = Agency::factory()->create();
        AgencySetting::forAgency($agency->id)->update([
            'order_number_prefix' => 'PL-',
            'order_number_suffix' => '-20',
            'order_number_padding' => 5,
        ]);
        $order = Order::factory()->create(['agency_id' => $agency->id, 'order_number' => 864]);

        $this->assertSame('PL-00864-20', $agency->formatOrderNumber($order->order_number));
        $this->assertSame(864, $order->refresh()->order_number);
    }
}
