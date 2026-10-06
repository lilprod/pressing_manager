<?php

namespace Tests\Feature\Platform;

use App\Models\Agency;
use App\Models\License;
use App\Models\Order;
use App\Models\PlatformAuditLog;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/** Fiche détail d'un pressing (CLAUDE.md « Audit de conformité Figma — interfaces superadmin », Chantier C). */
class PressingDetailTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_show_includes_a_real_agencies_count_and_license_payment_history(): void
    {
        $pressing = $this->makePressing();
        Agency::factory()->for($pressing)->count(3)->create();
        $license = License::current($pressing->id);
        $license->update(['expires_at' => now()->addDays(10)]);
        $license->payments()->create([
            'amount' => 50000,
            'method' => 'espece',
            'external_reference' => null,
            'paid_at' => now(),
            'new_expires_at' => now()->addMonth(),
        ]);
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->getJson("/api/platform/pressings/{$pressing->id}");

        $response->assertOk();
        $response->assertJsonPath('agencies_count', 3);
        $response->assertJsonCount(1, 'license.payments');
        $response->assertJsonPath('license.payments.0.amount', 50000);
        // Régression : days_remaining n'est pas un attribut persistant du modèle
        // License (contrairement à ce que supposait le frontend) — doit être calculé
        // à la volée, comme le fait déjà LicenseController::show() côté tenant.
        $this->assertContains($response->json('license.days_remaining'), [9, 10]);
    }

    public function test_agencies_endpoint_lists_real_staff_and_active_order_counts(): void
    {
        $pressing = $this->makePressing();
        $agency = Agency::factory()->for($pressing)->create(['name' => 'Agence A']);
        // OrderFactory::definition() crée aussi, en effet de bord, sa propre agence
        // de secours (non liée à $agency) — surchargée explicitement ici via
        // `->for($agency)` pour la commande elle-même, mais la fuite d'agence reste
        // présente ailleurs dans la base : on vérifie donc la bonne ligne par son
        // nom, jamais par position/compte total de la collection.
        Order::factory()->for($agency)->count(2)->create(['status' => 'recu']);
        Order::factory()->for($agency)->create(['status' => 'livre']);
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->getJson("/api/platform/pressings/{$pressing->id}/agencies");

        $response->assertOk();
        $agencies = collect($response->json());
        $this->assertTrue($agencies->contains('name', 'Agence A'));
        $row = $agencies->firstWhere('name', 'Agence A');
        // 2 commandes actives (recu), la 3e (livree) n'est jamais comptée comme active.
        $this->assertSame(2, $row['active_orders_count']);
    }

    public function test_a_transverse_user_cannot_read_agencies_of_an_unassigned_pressing(): void
    {
        $other = $this->makePressing();
        $user = $this->makeTransversePlatformUser([]);

        $response = $this->actingAs($user, 'platform')->getJson("/api/platform/pressings/{$other->id}/agencies");

        $response->assertStatus(403);
    }

    public function test_audit_log_can_be_filtered_to_a_single_pressing(): void
    {
        // Pressing::create() journalise déjà automatiquement via PlatformAuditable
        // (trait déjà en place) — on ajoute une 2e entrée manuelle pour vérifier
        // que le filtre retourne bien TOUTES les entrées de ce pressing, pas une
        // seule au hasard.
        $target = $this->makePressing('Cible', 'CIBLE-01');
        $other = $this->makePressing('Autre', 'AUTRE-01');
        PlatformAuditLog::create([
            'platform_user_id' => null,
            'action' => 'pressing.suspended',
            'auditable_type' => Pressing::class,
            'auditable_id' => $target->id,
            'new_values' => [],
        ]);
        $user = $this->makePlatformUser();

        $response = $this->actingAs($user, 'platform')->getJson("/api/platform/audit-logs?pressing_id={$target->id}");

        $response->assertOk();
        $response->assertJsonCount(2, 'data');
        $ids = collect($response->json('data'))->pluck('auditable_id')->unique();
        $this->assertSame([$target->id], $ids->all());
        $this->assertFalse($ids->contains($other->id));
    }

    public function test_a_transverse_user_not_assigned_cannot_read_another_pressings_audit_log_via_the_parameter(): void
    {
        $other = $this->makePressing();
        PlatformAuditLog::create([
            'platform_user_id' => null,
            'action' => 'pressing.created',
            'auditable_type' => Pressing::class,
            'auditable_id' => $other->id,
            'new_values' => [],
        ]);
        $user = $this->makeTransversePlatformUser([]);

        $response = $this->actingAs($user, 'platform')->getJson("/api/platform/audit-logs?pressing_id={$other->id}");

        $response->assertStatus(403);
    }
}
