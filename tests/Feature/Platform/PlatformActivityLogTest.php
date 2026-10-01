<?php

namespace Tests\Feature\Platform;

use App\Models\PlatformAuditLog;
use App\Models\PlatformUser;
use App\Services\TotpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

class PlatformActivityLogTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_a_successful_login_is_logged(): void
    {
        $user = $this->makePlatformUser('password');
        $login = $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'password']);

        $this->postJson('/api/platform/login/verify', [
            'challenge' => $login->json('challenge'),
            'code' => $this->currentTotpCode($user),
        ])->assertOk();

        $this->assertDatabaseHas('platform_audit_logs', [
            'auditable_type' => PlatformUser::class,
            'auditable_id' => $user->id,
            'action' => 'login.success',
        ]);
    }

    public function test_a_failed_login_is_logged(): void
    {
        $user = $this->makePlatformUser('password');

        $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'wrong']);

        $this->assertDatabaseHas('platform_audit_logs', [
            'auditable_type' => PlatformUser::class,
            'auditable_id' => $user->id,
            'action' => 'login.failed',
        ]);
    }

    public function test_a_lockout_is_logged(): void
    {
        $user = $this->makePlatformUser('password');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/platform/login', ['email' => $user->email, 'password' => 'wrong']);
        }

        $this->assertDatabaseHas('platform_audit_logs', [
            'auditable_type' => PlatformUser::class,
            'auditable_id' => $user->id,
            'action' => 'login.locked',
        ]);
    }

    public function test_creating_a_platform_user_is_logged_via_the_generic_auditable_trait(): void
    {
        $superadmin = $this->makePlatformUser();
        $role = \App\Models\PlatformRole::where('slug', 'auditeur_transverse')->firstOrFail();

        $this->actingAs($superadmin, 'platform')->postJson('/api/platform/users', [
            'name' => 'Nouvel Utilisateur',
            'email' => 'nouvel@spark-pressing.test',
            'platform_role_id' => $role->id,
        ])->assertCreated();

        $this->assertDatabaseHas('platform_audit_logs', [
            'action' => PlatformUser::class.'.created',
        ]);
    }
}
