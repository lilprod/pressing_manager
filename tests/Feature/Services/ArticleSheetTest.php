<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Client;
use App\Models\FinishOption;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Pressing;
use App\Models\Service;
use App\Models\ServicePriceTier;
use App\Models\TreatmentType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/** Fiche article conforme à la maquette « Modifier l'article » (2026-10-13). */
class ArticleSheetTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function counter(): array
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        return [$agency, $accueil, $client];
    }

    public function test_an_explicit_treatment_price_replaces_the_ratio_at_the_counter(): void
    {
        [$agency, $accueil, $client] = $this->counter();
        $service = Service::factory()->create(['base_price' => 6500]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $express = TreatmentType::factory()->create(['price_ratio' => 1.5]);
        $service->treatmentRates()->create(['treatment_type_id' => $express->id, 'price' => 9500]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'treatment_type_id' => $express->id]],
        ]);

        $response->assertCreated();
        // 9 500 explicite, pas 6 500 × 1,5 = 9 750.
        $this->assertSame(9500, $response->json('total_amount'));
    }

    public function test_an_express_treatment_line_makes_the_deposit_express_and_urgent(): void
    {
        [$agency, $accueil, $client] = $this->counter();
        $service = Service::factory()->create(['base_price' => 1000]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $express = TreatmentType::factory()->create(['code' => 'express', 'price_ratio' => 1.5]);
        $ironing = TreatmentType::factory()->create(['code' => 'repassage_seul', 'price_ratio' => 0.5]);

        $fast = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'treatment_type_id' => $express->id]],
        ])->assertCreated();
        $this->assertTrue($fast->json('is_express'));
        $this->assertSame('urgent', $fast->json('priority'));

        $slow = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'treatment_type_id' => $ironing->id]],
        ])->assertCreated();
        $this->assertFalse($slow->json('is_express'));
        $this->assertSame('normale', $slow->json('priority'));
    }

    public function test_an_agency_local_price_scales_the_explicit_treatment_price(): void
    {
        [$agency, $accueil, $client] = $this->counter();
        $service = Service::factory()->create(['base_price' => 2000]);
        $agency->services()->attach($service->id, ['is_active' => true, 'price_override' => 2200]);
        $express = TreatmentType::factory()->create(['price_ratio' => 1.5]);
        $service->treatmentRates()->create(['treatment_type_id' => $express->id, 'price' => 3000]);

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'treatment_type_id' => $express->id]],
        ]);

        // Prix local +10 % → Express explicite 3 000 × 1,1 = 3 300.
        $this->assertSame(3300, $response->json('total_amount'));
    }

    public function test_a_kilo_tier_uses_its_explicit_treatment_price_per_kg(): void
    {
        [$agency, $accueil, $client] = $this->counter();
        $service = Service::factory()->create(['billing_mode' => 'kg', 'base_price' => null]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $express = TreatmentType::factory()->create(['price_ratio' => 1.5]);
        ServicePriceTier::create(['service_id' => $service->id, 'weight_min' => 0, 'weight_max' => 3, 'price_per_kg' => 2800, 'treatment_prices' => [(string) $express->id => 4100]]);

        $classic = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'weight_kg' => 2]],
        ]);
        $this->assertSame(5600, $classic->json('total_amount'));

        $fast = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'weight_kg' => 2, 'treatment_type_id' => $express->id]],
        ]);
        $this->assertSame(8200, $fast->json('total_amount'));
    }

    public function test_the_treatment_delay_drives_the_promised_date(): void
    {
        [$agency, $accueil, $client] = $this->counter();
        $service = Service::factory()->create(['estimated_duration_hours' => 72]);
        $agency->services()->attach($service->id, ['is_active' => true]);
        $express = TreatmentType::factory()->create(['price_ratio' => 1.5]);
        $service->treatmentRates()->create(['treatment_type_id' => $express->id, 'delay_hours' => 24]);
        $this->travelTo(now()->startOfSecond());

        $response = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'treatment_type_id' => $express->id]],
        ]);

        $order = Order::findOrFail($response->json('id'));
        $this->assertTrue($order->promised_at->equalTo(now()->addHours(24)));
    }

    public function test_only_a_compatible_finish_can_be_chosen_and_it_is_stored(): void
    {
        [$agency, $accueil, $client] = $this->counter();
        $service = Service::factory()->create();
        $agency->services()->attach($service->id, ['is_active' => true]);
        $hanger = FinishOption::create(['pressing_id' => $agency->pressing_id, 'name' => 'Sur cintre']);
        $folded = FinishOption::create(['pressing_id' => $agency->pressing_id, 'name' => 'Plié']);
        $service->finishOptions()->sync([$hanger->id]);

        $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'finish_option_id' => $folded->id]],
        ])->assertStatus(422);

        $ok = $this->actingAs($accueil)->postJson('/api/orders', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'quantity' => 1, 'finish_option_id' => $hanger->id]],
        ]);
        $ok->assertCreated();
        $this->assertSame($hanger->id, OrderItem::where('order_id', $ok->json('id'))->value('finish_option_id'));
    }

    public function test_updating_an_article_syncs_its_treatment_prices_finishes_and_associations(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['base_price' => 6500]);
        $addon = Service::factory()->create(['name' => 'Traitement anti-odeur']);
        $express = TreatmentType::factory()->create(['price_ratio' => 1.5]);
        $hanger = FinishOption::create(['pressing_id' => $agency->pressing_id, 'name' => 'Sur cintre']);

        $response = $this->actingAs($admin)->patchJson("/api/services/{$service->id}", [
            'category' => 'Cérémonie',
            'home_delivery_enabled' => false,
            'treatment_rates' => [['treatment_type_id' => $express->id, 'price' => 9500, 'delay_hours' => 24]],
            'finish_option_ids' => [$hanger->id],
            'associated_service_ids' => [$addon->id],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('services', ['id' => $service->id, 'category' => 'Cérémonie', 'home_delivery_enabled' => false]);
        $this->assertDatabaseHas('service_treatment_prices', ['service_id' => $service->id, 'treatment_type_id' => $express->id, 'price' => 9500, 'delay_hours' => 24]);
        $this->assertDatabaseHas('service_finish_option', ['service_id' => $service->id, 'finish_option_id' => $hanger->id]);
        $this->assertDatabaseHas('service_associations', ['service_id' => $service->id, 'associated_service_id' => $addon->id]);
        $this->assertDatabaseHas('service_price_histories', ['service_id' => $service->id, 'field' => 'treatment_rates']);

        $this->actingAs($admin)->patchJson("/api/services/{$service->id}", ['associated_service_ids' => [$service->id]])->assertStatus(422);
    }

    public function test_a_treatment_type_of_another_pressing_is_rejected(): void
    {
        $this->seedRbac();
        Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create();
        $foreign = TreatmentType::factory()->create(['pressing_id' => Pressing::factory()->create()->id]);

        $this->actingAs($admin)->patchJson("/api/services/{$service->id}", [
            'treatment_rates' => [['treatment_type_id' => $foreign->id, 'price' => 100]],
        ])->assertStatus(422);
    }

    public function test_the_draft_is_kept_apart_until_published(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['name' => 'Costume', 'base_price' => 6500]);
        $agency->services()->attach($service->id, ['is_active' => true]);

        $this->actingAs($admin)->putJson("/api/services/{$service->id}/draft", ['data' => ['name' => 'Costume 2 pièces']])->assertOk();
        $this->assertDatabaseHas('services', ['id' => $service->id, 'name' => 'Costume']);

        $show = $this->actingAs($admin)->getJson("/api/services/{$service->id}");
        $show->assertJsonPath('draft_data.name', 'Costume 2 pièces');
        $show->assertJsonPath('draft_saver.name', $admin->name);

        // Jamais exposé au comptoir.
        $counter = $this->actingAs($admin)->getJson("/api/services?agency_id={$agency->id}");
        $this->assertArrayNotHasKey('draft_data', $counter->json('0'));

        $this->actingAs($admin)->patchJson("/api/services/{$service->id}", ['name' => 'Costume 2 pièces'])->assertOk();
        $this->assertDatabaseHas('services', ['id' => $service->id, 'name' => 'Costume 2 pièces', 'draft_data' => null]);

        $this->actingAs($admin)->putJson("/api/services/{$service->id}/draft", ['data' => ['name' => 'X']]);
        $this->actingAs($admin)->deleteJson("/api/services/{$service->id}/draft")->assertNoContent();
        $this->assertNull($service->fresh()->draft_saved_at);
    }

    public function test_an_article_not_eligible_for_home_delivery_blocks_the_delivery(): void
    {
        [$agency, $accueil] = $this->counter();
        $service = Service::factory()->create(['name' => 'Robe de mariée', 'home_delivery_enabled' => false]);
        $order = Order::factory()->create(['agency_id' => $agency->id]);
        OrderItem::factory()->create(['order_id' => $order->id, 'agency_id' => $agency->id, 'service_id' => $service->id]);

        $this->actingAs($accueil)->postJson('/api/deliveries', [
            'order_id' => $order->id,
            'address' => '12 rue du marché',
        ])->assertStatus(422);
    }

    public function test_finish_options_are_scoped_to_their_pressing(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $foreign = FinishOption::create(['pressing_id' => Pressing::factory()->create()->id, 'name' => 'Plié']);

        $list = $this->actingAs($admin, 'web')->getJson('/api/finish-options');
        $this->assertCount(count(FinishOption::DEFAULTS), $list->json());
        $this->assertNotContains($foreign->id, collect($list->json())->pluck('id')->all());

        $this->actingAs($admin, 'web')->postJson('/api/finish-options', ['name' => 'Sur cintre luxe'])->assertCreated();
        $this->actingAs($admin, 'web')->patchJson("/api/finish-options/{$foreign->id}", ['is_active' => false])->assertForbidden();
    }
}
