<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\AuthEvent;
use App\Models\Client;
use App\Models\User;
use App\Services\TotpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class AccountSecurityTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function login(User $user, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/login', array_merge(['email' => $user->email, 'password' => 'password', 'device_name' => 'phpunit'], $extra));
    }

    private function enableMfa(User $user): string
    {
        $totp = app(TotpService::class);
        $secret = $totp->generateSecret();
        $user->forceFill(['mfa_secret' => $secret, 'mfa_enabled_at' => now()])->save();

        return $secret;
    }

    public function test_login_records_events_and_session_metadata(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        $this->login($user, ['password' => 'wrong'])->assertStatus(422);
        $this->withHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537')->login($user)->assertOk();

        $this->assertSame(['login_failed', 'login'], AuthEvent::where('user_id', $user->id)->orderBy('id')->pluck('type')->all());
        $this->assertNotNull($user->fresh()->last_login_at);
        $this->assertNotNull($user->tokens()->first()->user_agent);
    }

    public function test_mfa_login_requires_a_valid_code_and_can_trust_the_device(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('manager', Agency::factory()->create());
        $secret = $this->enableMfa($user);

        $first = $this->login($user)->assertOk();
        $this->assertTrue($first->json('mfa_required'));
        $this->assertNull($first->json('token'));

        $this->postJson('/api/login/mfa', ['challenge' => $first->json('challenge'), 'code' => '000000'])->assertStatus(422);

        $code = app(TotpService::class)->currentCode($secret);
        $verified = $this->postJson('/api/login/mfa', ['challenge' => $first->json('challenge'), 'code' => $code, 'trust_device' => true])->assertOk();
        $this->assertNotNull($verified->json('token'));
        $deviceToken = $verified->json('device_token');
        $this->assertNotNull($deviceToken);

        // Appareil de confiance : plus de second facteur.
        $this->login($user, ['device_token' => $deviceToken])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_mfa_enrolment_returns_recovery_codes_usable_once(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('manager', Agency::factory()->create());

        $setup = $this->actingAs($user)->postJson('/api/profile/mfa/setup')->assertOk();
        $code = app(TotpService::class)->currentCode($setup->json('secret'));
        $codes = $this->actingAs($user)->postJson('/api/profile/mfa/confirm', ['code' => $code])->assertOk()->json('recovery_codes');
        $this->assertCount(8, $codes);
        $this->assertTrue($user->fresh()->mfa_enabled);

        $challenge = $this->login($user)->json('challenge');
        $this->postJson('/api/login/mfa', ['challenge' => $challenge, 'code' => $codes[0]])->assertOk();
        $challenge = $this->login($user)->json('challenge');
        $this->postJson('/api/login/mfa', ['challenge' => $challenge, 'code' => $codes[0]])->assertStatus(422);
    }

    public function test_sessions_can_be_listed_and_others_revoked(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());
        $current = $this->login($user)->json('token');
        $this->login($user);

        $security = $this->withToken($current)->getJson('/api/profile/security')->assertOk();
        $this->assertCount(2, $security->json('sessions'));
        $this->assertCount(1, collect($security->json('sessions'))->where('current', true));

        $this->withToken($current)->deleteJson('/api/profile/sessions')->assertOk()->assertJson(['revoked' => 1]);
        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_complementary_agency_grants_access_to_its_data(): void
    {
        $this->seedRbac();
        $main = Agency::factory()->create();
        $extra = Agency::factory()->create(['pressing_id' => $main->pressing_id]);
        $other = Agency::factory()->create(['pressing_id' => $main->pressing_id]);
        $admin = $this->makeUser('admin');
        $accueil = $this->makeUser('accueil', $main);
        $extraClient = Client::factory()->for($extra, 'agency')->create();
        $otherClient = Client::factory()->for($other, 'agency')->create();

        $this->actingAs($accueil)->getJson("/api/clients/{$extraClient->id}")->assertForbidden();

        $this->actingAs($admin)->patchJson("/api/users/{$accueil->id}", ['extra_agency_ids' => [$extra->id]])->assertOk();
        $accueil->refresh();

        $this->actingAs($accueil)->getJson("/api/clients/{$extraClient->id}")->assertOk();
        $this->actingAs($accueil)->getJson("/api/clients/{$otherClient->id}")->assertForbidden();
        $ids = collect($this->actingAs($accueil)->getJson('/api/clients')->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($extraClient->id));
        $this->assertFalse($ids->contains($otherClient->id));
        $this->assertTrue(AuthEvent::where('user_id', $accueil->id)->where('type', 'agency_assigned')->exists());
    }

    public function test_invitations_stats_resend_and_revoke(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $role = \App\Models\Role::where('slug', 'accueil')->first();

        $created = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Mariam Traoré', 'email' => 'mariam@example.test', 'role_id' => $role->id, 'agency_id' => $agency->id, 'mfa_required' => true,
        ])->assertCreated();
        $invitee = User::find($created->json('id'));
        $this->assertNotNull($invitee->invitation_expires_at);
        $this->assertTrue($invitee->mfa_required);

        $stats = $this->actingAs($admin)->getJson('/api/users/stats')->assertOk();
        $this->assertSame(1, $stats->json('pending_invitations'));
        $this->assertSame(1, collect($this->actingAs($admin)->getJson('/api/users?full=1&status=pending')->json('data'))->count());

        $this->actingAs($admin)->postJson("/api/users/{$invitee->id}/invitation")->assertOk()->assertJsonStructure(['temporary_password']);
        $this->actingAs($admin)->deleteJson("/api/users/{$invitee->id}/invitation")->assertOk();
        $this->assertFalse($invitee->fresh()->is_active);

        $types = collect($this->actingAs($admin)->getJson('/api/users/activity')->json())->pluck('type');
        $this->assertTrue($types->contains('invitation_revoked'));
    }

    public function test_csv_import_is_all_or_nothing(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create(['code' => 'AKW']);
        $admin = $this->makeUser('admin');

        $bad = UploadedFile::fake()->createWithContent('team.csv', "nom;email;telephone;role;agence\nAwa;awa@example.test;;accueil;AKW\nBob;pas-un-email;;accueil;AKW\n");
        $this->actingAs($admin)->post('/api/users/import', ['file' => $bad], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonPath('errors.0.row', 3);
        $this->assertFalse(User::where('email', 'awa@example.test')->exists());

        $good = UploadedFile::fake()->createWithContent('team.csv', "nom;email;telephone;role;agence\nAwa;awa@example.test;;accueil;AKW\n");
        $this->actingAs($admin)->post('/api/users/import', ['file' => $good], ['Accept' => 'application/json'])->assertCreated()->assertJson(['created' => 1]);
        $this->assertSame($agency->id, User::where('email', 'awa@example.test')->value('agency_id'));
    }

    public function test_profile_update_composes_name_and_stores_preferences(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());

        $this->actingAs($user)->postJson('/api/profile', [
            'first_name' => 'Nadine', 'last_name' => 'Essomba', 'job_title' => "Responsable d'agence",
            'timezone' => 'Africa/Douala', 'preferences' => ['daily_summary' => true],
        ])->assertOk();

        $user->refresh();
        $this->assertSame('Nadine Essomba', $user->name);
        $this->assertSame(['daily_summary' => true], $user->preferences);
    }

    public function test_daily_summary_is_sent_only_to_users_who_opted_in(): void
    {
        Notification::fake();
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $opted = $this->makeUser('manager', $agency);
        $opted->update(['preferences' => ['daily_summary' => true]]);
        $other = $this->makeUser('accueil', $agency);

        $this->artisan('staff:send-daily-summaries')->assertSuccessful();

        Notification::assertSentTo($opted, \App\Notifications\DailySummaryNotification::class);
        Notification::assertNotSentTo($other, \App\Notifications\DailySummaryNotification::class);
    }
}
