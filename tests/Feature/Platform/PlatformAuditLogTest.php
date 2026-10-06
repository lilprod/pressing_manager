<?php

namespace Tests\Feature\Platform;

use App\Models\PlatformAuditLog;
use App\Models\Pressing;
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

    public function test_category_security_matches_impersonation_and_status_or_token_changes_only(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressing = $this->makePressing();

        $pressing->update(['status' => 'suspended']); // -> security (clé 'status')
        $pressing->update(['name' => 'Nom changé']); // -> configuration (ni status ni token)
        PlatformAuditLog::create([
            'platform_user_id' => $superadmin->id,
            'action' => 'pressing.impersonated',
            'auditable_type' => Pressing::class,
            'auditable_id' => $pressing->id,
        ]); // -> security

        $security = $this->actingAs($superadmin, 'platform')
            ->getJson("/api/platform/audit-logs?pressing_id={$pressing->id}&category=security");
        $configuration = $this->actingAs($superadmin, 'platform')
            ->getJson("/api/platform/audit-logs?pressing_id={$pressing->id}&category=configuration");

        $security->assertOk();
        $configuration->assertOk();
        $this->assertSame(2, $security->json('total'));
        $securityActions = collect($security->json('data'))->pluck('action');
        $this->assertTrue($securityActions->contains('pressing.impersonated'));
        $configurationActions = collect($configuration->json('data'))->pluck('action');
        $this->assertFalse($configurationActions->contains('pressing.impersonated'));
    }

    public function test_search_filters_by_action_or_actor_name(): void
    {
        $actor = $this->makePlatformUser();
        $pressing = $this->makePressing();
        PlatformAuditLog::create([
            'platform_user_id' => $actor->id,
            'action' => 'pressing.impersonated',
            'auditable_type' => Pressing::class,
            'auditable_id' => $pressing->id,
        ]);

        $response = $this->actingAs($actor, 'platform')
            ->getJson("/api/platform/audit-logs?pressing_id={$pressing->id}&search=impersonated");

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('total'));

        $none = $this->actingAs($actor, 'platform')
            ->getJson("/api/platform/audit-logs?pressing_id={$pressing->id}&search=rien-a-voir-xyz");
        $this->assertSame(0, $none->json('total'));
    }

    public function test_export_requires_a_pressing_id(): void
    {
        $superadmin = $this->makePlatformUser();

        $csv = $this->actingAs($superadmin, 'platform')->get('/api/platform/audit-logs/export/csv');
        $pdf = $this->actingAs($superadmin, 'platform')->get('/api/platform/audit-logs/export/pdf');

        $csv->assertStatus(422);
        $pdf->assertStatus(422);
    }

    public function test_export_is_rejected_for_a_pressing_outside_the_transverse_users_scope(): void
    {
        $pressingA = $this->makePressing('A', 'A-EXPORT');
        $pressingB = $this->makePressing('B', 'B-EXPORT');
        $viewer = $this->makeTransversePlatformUser([$pressingA->id], 'auditeur_transverse');

        $response = $this->actingAs($viewer, 'platform')
            ->get("/api/platform/audit-logs/export/csv?pressing_id={$pressingB->id}");

        $response->assertStatus(403);
    }

    public function test_csv_export_returns_a_real_csv_file(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressing = $this->makePressing();
        $pressing->update(['name' => 'Nom changé']);

        $response = $this->actingAs($superadmin, 'platform')
            ->get("/api/platform/audit-logs/export/csv?pressing_id={$pressing->id}");

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        $content = $response->streamedContent();
        $this->assertStringContainsString('Action', $content);
        $this->assertStringContainsString('App\Models\Pressing.updated', $content);
    }

    public function test_pdf_export_returns_a_pdf_file(): void
    {
        $superadmin = $this->makePlatformUser();
        $pressing = $this->makePressing();

        $response = $this->actingAs($superadmin, 'platform')
            ->get("/api/platform/audit-logs/export/pdf?pressing_id={$pressing->id}");

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
    }
}
