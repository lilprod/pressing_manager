<?php

namespace Tests\Feature\Promotions;

use App\Models\Agency;
use App\Models\Promotion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md, node Figma 72:20021) : le volet
 * promotions était entièrement absent du backend — ce test couvre le CRUD de base
 * (création en brouillon, publication, édition) et l'isolation par pressing.
 */
class PromotionManagementTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_admin_can_create_a_promotion_as_a_draft(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->postJson('/api/promotions', [
            'name' => 'Offre rentrée',
            'code' => 'RENTREE15',
            'discount_type' => 'percentage',
            'discount_value' => 15,
            'starts_at' => now()->toDateString(),
            'ends_at' => now()->addMonth()->toDateString(),
            'quota_total' => 250,
            'quota_per_client' => 1,
            'minimum_order_amount' => 10000,
            'is_active' => false,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', 'draft');
        $this->assertDatabaseHas('promotions', ['code' => 'RENTREE15', 'is_active' => false]);
    }

    public function test_publishing_a_promotion_makes_it_active_within_its_period(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $promotion = Promotion::factory()->create([
            'pressing_id' => $admin->pressing_id, 'is_active' => false,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
        ]);

        $response = $this->actingAs($admin)->patchJson("/api/promotions/{$promotion->id}", ['is_active' => true]);

        $response->assertOk();
        $response->assertJsonPath('status', 'active');
    }

    public function test_a_scheduled_promotion_is_not_yet_active(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $promotion = Promotion::factory()->create([
            'pressing_id' => $admin->pressing_id, 'is_active' => true,
            'starts_at' => now()->addWeek(), 'ends_at' => now()->addMonth(),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/promotions');

        $response->assertOk();
        $this->assertSame('scheduled', collect($response->json('data'))->firstWhere('id', $promotion->id)['status']);
    }

    public function test_two_promotions_cannot_share_the_same_code_in_one_pressing(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        Promotion::factory()->create(['pressing_id' => $admin->pressing_id, 'code' => 'DOUBLON']);

        $response = $this->actingAs($admin)->postJson('/api/promotions', [
            'name' => 'Autre',
            'code' => 'DOUBLON',
            'discount_type' => 'fixed',
            'discount_value' => 5000,
            'starts_at' => now()->toDateString(),
            'ends_at' => now()->addMonth()->toDateString(),
        ]);

        $response->assertStatus(422);
    }

    public function test_creating_a_promotion_requires_the_clients_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $technicien = $this->makeUser('technicien', $agency);

        $response = $this->actingAs($technicien)->postJson('/api/promotions', [
            'name' => 'Offre',
            'code' => 'TEST10',
            'discount_type' => 'percentage',
            'discount_value' => 10,
            'starts_at' => now()->toDateString(),
            'ends_at' => now()->addMonth()->toDateString(),
        ]);

        $response->assertStatus(403);
    }

    public function test_a_promotion_scoped_to_specific_agencies_is_isolated_from_another_pressing(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');
        $otherPressing = \App\Models\Pressing::factory()->create(['code' => 'OTHER-PRESSING']);
        $otherAgency = Agency::factory()->create(['pressing_id' => $otherPressing->id]);

        $response = $this->actingAs($admin)->postJson('/api/promotions', [
            'name' => 'Offre',
            'code' => 'AGENCY1',
            'discount_type' => 'percentage',
            'discount_value' => 10,
            'starts_at' => now()->toDateString(),
            'ends_at' => now()->addMonth()->toDateString(),
            'agency_ids' => [$otherAgency->id],
        ]);

        $response->assertStatus(422);
    }
}
