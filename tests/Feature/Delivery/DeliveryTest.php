<?php

namespace Tests\Feature\Delivery;

use App\Models\Agency;
use App\Models\Delivery;
use App\Models\DeliveryZone;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class DeliveryTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_creating_a_delivery_defaults_the_fee_from_the_zone(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);
        $zone = DeliveryZone::factory()->create(['agency_id' => $agency->id, 'fee' => 1500]);

        $response = $this->actingAs($accueil)->postJson('/api/deliveries', [
            'order_id' => $order->id,
            'address' => '12 rue du marché',
            'delivery_zone_id' => $zone->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('fee', 1500);
        $response->assertJsonPath('status', 'a_planifier');
    }

    public function test_an_assigned_livreur_can_move_a_delivery_to_en_cours(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $livreur = $this->makeUser('livreur', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);

        $delivery = $this->actingAs($accueil)->postJson('/api/deliveries', [
            'order_id' => $order->id,
            'address' => '12 rue du marché',
        ])->json();

        $this->actingAs($accueil)->postJson("/api/deliveries/{$delivery['id']}/assign", [
            'livreur_id' => $livreur->id,
        ])->assertOk();

        $response = $this->actingAs($livreur)->postJson("/api/deliveries/{$delivery['id']}/status", [
            'status' => 'en_cours',
        ]);

        $response->assertOk()->assertJsonPath('status', 'en_cours');
    }

    public function test_a_livreur_not_assigned_to_the_delivery_cannot_act_on_it(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $assignedLivreur = $this->makeUser('livreur', $agency);
        $otherLivreur = $this->makeUser('livreur', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);

        $delivery = $this->actingAs($accueil)->postJson('/api/deliveries', [
            'order_id' => $order->id,
            'address' => '12 rue du marché',
        ])->json();

        $this->actingAs($accueil)->postJson("/api/deliveries/{$delivery['id']}/assign", ['livreur_id' => $assignedLivreur->id]);

        $response = $this->actingAs($otherLivreur)->postJson("/api/deliveries/{$delivery['id']}/status", [
            'status' => 'en_cours',
        ]);

        $response->assertStatus(403);
    }

    public function test_completing_a_delivery_requires_photo_signature_and_gps_and_stores_them(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);
        $delivery = Delivery::factory()->create([
            'agency_id' => $agency->id,
            'order_id' => $order->id,
            'livreur_id' => $livreur->id,
            'status' => 'en_cours',
        ]);

        $missingProof = $this->actingAs($livreur)->postJson("/api/deliveries/{$delivery->id}/complete", [
            'latitude' => 6.13,
            'longitude' => 1.22,
        ]);
        $missingProof->assertStatus(422);

        $response = $this->actingAs($livreur)->post("/api/deliveries/{$delivery->id}/complete", [
            'photo' => UploadedFile::fake()->image('preuve.jpg'),
            'signature' => UploadedFile::fake()->image('signature.png'),
            'latitude' => 6.13,
            'longitude' => 1.22,
        ]);

        $response->assertOk();
        $response->assertJsonPath('status', 'livree');
        $this->assertNotNull($response->json('proof_photo_path'));
        $this->assertNotNull($response->json('signature_path'));
        $this->assertEquals(6.13, $response->json('latitude'));
    }

    public function test_a_delivery_cannot_be_completed_before_being_started(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);
        $delivery = Delivery::factory()->create([
            'agency_id' => $agency->id,
            'order_id' => $order->id,
            'livreur_id' => $livreur->id,
            'status' => 'a_planifier',
        ]);

        $response = $this->actingAs($livreur)->post("/api/deliveries/{$delivery->id}/complete", [
            'photo' => UploadedFile::fake()->image('preuve.jpg'),
            'signature' => UploadedFile::fake()->image('signature.png'),
            'latitude' => 6.13,
            'longitude' => 1.22,
        ]);

        $response->assertStatus(422);
    }

    public function test_a_failed_delivery_can_be_rescheduled(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        $order = Order::factory()->create(['agency_id' => $agency->id]);
        $delivery = Delivery::factory()->create([
            'agency_id' => $agency->id,
            'order_id' => $order->id,
            'livreur_id' => $livreur->id,
            'status' => 'en_cours',
        ]);

        $failed = $this->actingAs($livreur)->postJson("/api/deliveries/{$delivery->id}/fail", [
            'reason' => 'Client absent',
        ]);
        $failed->assertOk()->assertJsonPath('status', 'echouee');

        $rescheduled = $this->actingAs($livreur)->postJson("/api/deliveries/{$delivery->id}/status", [
            'status' => 'a_planifier',
        ]);
        $rescheduled->assertOk()->assertJsonPath('status', 'a_planifier');
    }

    public function test_deliveries_are_scoped_per_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $orderB = Order::factory()->create(['agency_id' => $agencyB->id]);

        $response = $this->actingAs($accueilA)->postJson('/api/deliveries', [
            'order_id' => $orderB->id,
            'address' => 'ailleurs',
        ]);

        $response->assertStatus(403);
    }

    public function test_listing_livreurs_is_scoped_to_the_requesting_users_agency(): void
    {
        $this->seedRbac();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $accueilA = $this->makeUser('accueil', $agencyA);
        $this->makeUser('livreur', $agencyA);
        $this->makeUser('livreur', $agencyB);

        $response = $this->actingAs($accueilA)->getJson('/api/users?role=livreur');

        $response->assertOk();
        $this->assertCount(1, $response->json());
    }

    public function test_listing_livreurs_requires_the_deliveries_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);

        $response = $this->actingAs($livreur)->getJson('/api/users?role=livreur');

        $response->assertStatus(403);
    }

    public function test_a_local_user_creates_a_delivery_zone_without_supplying_agency_id(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/delivery-zones', [
            'name' => 'Zone test',
            'fee' => 750,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('agency_id', $agency->id);
    }

    public function test_a_global_user_must_supply_agency_id_to_create_a_delivery_zone(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $manager = $this->makeUser('manager');

        $missing = $this->actingAs($manager)->postJson('/api/delivery-zones', [
            'name' => 'Zone test',
            'fee' => 750,
        ]);
        $missing->assertStatus(422);

        $withAgency = $this->actingAs($manager)->postJson('/api/delivery-zones', [
            'agency_id' => $agency->id,
            'name' => 'Zone test',
            'fee' => 750,
        ]);
        $withAgency->assertCreated();
    }
}
