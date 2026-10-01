<?php

namespace Tests\Feature\Platform\Auth;

use App\Models\Agency;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Le test le plus important de ce chantier : preuve exécutable que le correctif de
 * config/auth.php (guard `sanctum` épinglé sur provider `users`, nouveau guard
 * `platform` sur provider `platform_users`) isole réellement les deux royaumes.
 * Utilise volontairement des jetons bruts (pas actingAs()) : actingAs() positionne
 * l'utilisateur sur le guard par défaut ('web'), que le pré-contrôle de
 * Sanctum\Guard::__invoke() consulterait avant même de parser le jeton — un vrai jeton
 * HTTP est le seul moyen d'exercer hasValidProvider() pour de vrai.
 */
class GuardIsolationTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform, SeedsRbac;

    public function test_a_tenant_token_is_rejected_by_the_platform_guard(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $tenantUser = $this->makeUser('accueil', $agency);
        $tenantToken = $tenantUser->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$tenantToken}")->getJson('/api/platform/me');

        $response->assertStatus(401);
    }

    public function test_a_platform_token_is_rejected_by_the_tenant_guard(): void
    {
        $platformUser = $this->makePlatformUser();
        $platformToken = $platformUser->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$platformToken}")->getJson('/api/me');

        $response->assertStatus(401);
    }

    public function test_a_platform_token_is_rejected_by_any_tenant_sanctum_route(): void
    {
        $platformUser = $this->makePlatformUser();
        $platformToken = $platformUser->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$platformToken}")->getJson('/api/orders');

        $response->assertStatus(401);
    }

    public function test_a_pressing_report_token_cannot_be_used_as_a_sanctum_bearer_token(): void
    {
        $plan = $this->makePlatformPlan();
        $pressing = Pressing::create(['name' => 'Éclat Royal', 'code' => 'ECL', 'platform_plan_id' => $plan->id]);
        $reportToken = $pressing->generateReportToken();

        $response = $this->withHeader('Authorization', "Bearer {$reportToken}")->getJson('/api/platform/me');

        $response->assertStatus(401);
    }

    public function test_a_platform_sanctum_token_cannot_be_used_as_a_pressing_report_token(): void
    {
        $platformUser = $this->makePlatformUser();
        $platformToken = $platformUser->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$platformToken}")->postJson('/api/platform/reports', [
            'agencies_count' => 1,
            'active_users_count' => 1,
            'operations_count' => 1,
            'period_started_at' => now()->subHour(),
            'period_ended_at' => now(),
        ]);

        $response->assertStatus(401);
    }

    public function test_a_valid_platform_token_is_accepted_by_the_platform_guard(): void
    {
        $platformUser = $this->makePlatformUser();
        $platformToken = $platformUser->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$platformToken}")->getJson('/api/platform/me');

        $response->assertOk();
        $response->assertJsonPath('email', $platformUser->email);
    }
}
