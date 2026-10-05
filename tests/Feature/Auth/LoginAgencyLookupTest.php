<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Pressing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

class LoginAgencyLookupTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_unknown_email_returns_a_neutral_unknown_response(): void
    {
        $response = $this->postJson('/api/login/agencies', ['email' => 'inconnu@example.com']);

        $response->assertOk()->assertJson(['type' => 'unknown', 'agencies' => []]);
    }

    public function test_a_local_user_email_returns_its_fixed_agency(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create(['name' => 'Agence Centrale']);
        $user = $this->makeUser('accueil', $agency);

        $response = $this->postJson('/api/login/agencies', ['email' => $user->email]);

        $response->assertOk()->assertJson([
            'type' => 'local',
            'agency' => ['id' => $agency->id, 'name' => $agency->name],
        ]);
    }

    public function test_a_global_user_email_returns_the_active_agencies_of_their_pressing_only(): void
    {
        $this->seedRbac();
        $pressing = Pressing::factory()->create();
        $ownAgencyActive = Agency::factory()->create(['pressing_id' => $pressing->id, 'is_active' => true]);
        Agency::factory()->create(['pressing_id' => $pressing->id, 'is_active' => false]);
        $otherPressing = Pressing::factory()->create();
        $otherPressingAgency = Agency::factory()->create(['pressing_id' => $otherPressing->id, 'is_active' => true]);

        $user = $this->makeUser('admin');
        $user->forceFill(['pressing_id' => $pressing->id])->save();

        $response = $this->postJson('/api/login/agencies', ['email' => $user->email]);

        $response->assertOk()->assertJson(['type' => 'global']);
        $ids = collect($response->json('agencies'))->pluck('id');
        $this->assertTrue($ids->contains($ownAgencyActive->id));
        $this->assertFalse($ids->contains($otherPressingAgency->id));
        $this->assertCount(1, $ids);
    }

    public function test_an_inactive_user_email_returns_a_neutral_unknown_response(): void
    {
        $this->seedRbac();
        $user = $this->makeUser('accueil', Agency::factory()->create());
        $user->forceFill(['is_active' => false])->save();

        $response = $this->postJson('/api/login/agencies', ['email' => $user->email]);

        $response->assertOk()->assertJson(['type' => 'unknown', 'agencies' => []]);
    }
}
