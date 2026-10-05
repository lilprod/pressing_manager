<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformAuditLogTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_superadmin_sees_pressing_audit_entries(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressing = $this->makePressing();
        $pressing->update(['name' => 'Nouveau nom']);

        $response = $this->actingAs($superadmin, 'platform')->getJson('/api/platform/audit-logs?type=pressing');

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('total'));
    }

    public function test_a_transverse_user_only_sees_their_assigned_pressings_activity(): void
    {
        $pressingA = $this->makePressing('A', 'A-AUDIT');
        $pressingB = $this->makePressing('B', 'B-AUDIT');
        $pressingA->update(['name' => 'A modifié']);
        $pressingB->update(['name' => 'B modifié']);

        $viewer = $this->makeTransversePlatformUser([$pressingA->id], 'admin_transverse');

        $response = $this->actingAs($viewer, 'platform')->getJson('/api/platform/audit-logs?type=pressing');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('auditable_id')->unique();
        $this->assertTrue($ids->every(fn ($id) => $id === $pressingA->id));
    }

    public function test_listing_audit_logs_requires_reports_view(): void
    {
        // auditeur_transverse a bien reports.view ; on vérifie plutôt qu'une requête
        // sans cette permission échoue en construisant un rôle vide pour le test.
        $pressing = $this->makePressing();
        $viewer = $this->makeTransversePlatformUser([$pressing->id], 'auditeur_transverse');
        $viewer->platformRole->permissions()->detach();

        $response = $this->actingAs($viewer, 'platform')->getJson('/api/platform/audit-logs');

        $response->assertStatus(403);
    }
}
