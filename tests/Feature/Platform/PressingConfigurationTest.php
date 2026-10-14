<?php

namespace Tests\Feature\Platform;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\SeedsPlatform;
use Tests\TestCase;

/** Écran « Configuration du pressing » : nom commercial, logo, règles de fidélité appliquées aux agences. */
class PressingConfigurationTest extends TestCase
{
    use RefreshDatabase, SeedsPlatform;

    public function test_settings_expose_commercial_name_rules_and_validation_facts(): void
    {
        $pressing = $this->makePressing();
        [$a, $b] = Agency::factory()->for($pressing)->count(2)->create();
        AgencySetting::forAgency($a->id)->update(['loyalty_point_expiry_months' => 12]);
        AgencySetting::forAgency($b->id)->update(['loyalty_point_expiry_months' => 6]);
        AppSetting::current($pressing->id)->update(['pressing_name' => 'Éclat Royal']);
        $admin = $this->makePlatformUser();

        $res = $this->actingAs($admin, 'platform')->getJson("/api/platform/pressings/{$pressing->id}/settings")->assertOk();

        $res->assertJsonPath('commercial_name', 'Éclat Royal');
        $res->assertJsonPath('has_logo', false);
        $res->assertJsonPath('loyalty_rules.expiry_months.uniform', false);
        $res->assertJsonPath('agencies_total', 2);
    }

    public function test_update_applies_commercial_name_and_loyalty_rules_to_every_agency(): void
    {
        $pressing = $this->makePressing();
        [$a, $b] = Agency::factory()->for($pressing)->count(2)->create();
        $foreign = Agency::factory()->for($this->makePressing('Autre'))->create();
        $admin = $this->makePlatformUser();

        $this->actingAs($admin, 'platform')->patchJson("/api/platform/pressings/{$pressing->id}", [
            'commercial_name' => 'Éclat Royal',
            'loyalty_rules' => ['amount_per_point' => 250, 'expiry_months' => 12],
        ])->assertOk();

        $this->assertSame('Éclat Royal', AppSetting::current($pressing->id)->pressing_name);
        foreach ([$a, $b] as $agency) {
            $s = AgencySetting::forAgency($agency->id);
            $this->assertSame(250, (int) $s->loyalty_amount_per_point);
            $this->assertSame(12, (int) $s->loyalty_point_expiry_months);
        }
        $this->assertNotSame(250, (int) AgencySetting::forAgency($foreign->id)->loyalty_amount_per_point);
    }

    public function test_logo_can_be_uploaded_streamed_and_removed(): void
    {
        Storage::fake(config('filesystems.default'));
        $pressing = $this->makePressing();
        $admin = $this->makePlatformUser();

        $this->actingAs($admin, 'platform')->post("/api/platform/pressings/{$pressing->id}/logo", [
            'logo' => UploadedFile::fake()->image('logo.png', 64, 64),
        ], ['Accept' => 'application/json'])->assertOk();
        $this->assertNotNull(AppSetting::current($pressing->id)->logo_path);
        $this->get("/api/platform/pressings/{$pressing->id}/logo")->assertOk();

        $this->deleteJson("/api/platform/pressings/{$pressing->id}/logo")->assertOk();
        $this->assertNull(AppSetting::current($pressing->id)->refresh()->logo_path);
    }

    public function test_an_unassigned_transverse_user_cannot_upload_a_logo(): void
    {
        $pressing = $this->makePressing();
        $transverse = $this->makePlatformUser('password', 'admin_transverse');

        $this->actingAs($transverse, 'platform')->post("/api/platform/pressings/{$pressing->id}/logo", [
            'logo' => UploadedFile::fake()->image('logo.png'),
        ], ['Accept' => 'application/json'])->assertForbidden();
    }
}
