<?php

namespace Tests\Feature\Loyalty;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Client;
use App\Models\LoyaltyPointMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Chantier « Re-audit Pressing — fidélité » (voir CLAUDE.md) : expiration réelle des
 * points de fidélité, par agence, via la commande `loyalty:expire-points`.
 */
class LoyaltyPointExpiryTest extends TestCase
{
    use RefreshDatabase;

    public function test_points_expire_after_the_configured_number_of_months(): void
    {
        $agency = Agency::factory()->create();
        AgencySetting::forAgency($agency->id)->update(['loyalty_point_expiry_months' => 6]);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 20]);

        $movement = LoyaltyPointMovement::create([
            'client_id' => $client->id,
            'agency_id' => $agency->id,
            'points' => 20,
            'reason' => 'payment',
            'created_at' => now()->subMonths(7),
        ]);

        $this->artisan('loyalty:expire-points')->assertExitCode(0);

        $this->assertSame(0, $client->refresh()->loyalty_points);
        $this->assertNotNull($movement->refresh()->expired_at);
        $this->assertDatabaseHas('loyalty_point_movements', [
            'client_id' => $client->id,
            'agency_id' => $agency->id,
            'reason' => 'expired',
            'points' => -20,
        ]);
    }

    public function test_the_client_balance_never_goes_below_zero(): void
    {
        $agency = Agency::factory()->create();
        AgencySetting::forAgency($agency->id)->update(['loyalty_point_expiry_months' => 1]);
        // Solde déjà inférieur au total des mouvements de gain (cas limite simulé) —
        // la décrémentation doit s'arrêter à 0, jamais passer en négatif.
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 5]);

        LoyaltyPointMovement::create([
            'client_id' => $client->id,
            'agency_id' => $agency->id,
            'points' => 20,
            'reason' => 'payment',
            'created_at' => now()->subMonths(2),
        ]);

        $this->artisan('loyalty:expire-points');

        $this->assertSame(0, $client->refresh()->loyalty_points);
    }

    public function test_an_agency_without_expiry_configured_is_never_touched(): void
    {
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 30]);
        $movement = LoyaltyPointMovement::create([
            'client_id' => $client->id,
            'agency_id' => $agency->id,
            'points' => 30,
            'reason' => 'payment',
            'created_at' => now()->subYears(2),
        ]);

        $this->artisan('loyalty:expire-points');

        $this->assertSame(30, $client->refresh()->loyalty_points);
        $this->assertNull($movement->refresh()->expired_at);
    }

    public function test_a_movement_still_within_the_delay_is_not_expired(): void
    {
        $agency = Agency::factory()->create();
        AgencySetting::forAgency($agency->id)->update(['loyalty_point_expiry_months' => 6]);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 10]);
        $movement = LoyaltyPointMovement::create([
            'client_id' => $client->id,
            'agency_id' => $agency->id,
            'points' => 10,
            'reason' => 'payment',
            'created_at' => now()->subMonths(2),
        ]);

        $this->artisan('loyalty:expire-points');

        $this->assertSame(10, $client->refresh()->loyalty_points);
        $this->assertNull($movement->refresh()->expired_at);
    }

    public function test_expiry_is_isolated_per_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        AgencySetting::forAgency($agencyA->id)->update(['loyalty_point_expiry_months' => 1]);
        AgencySetting::forAgency($agencyB->id)->update(['loyalty_point_expiry_months' => 1]);
        $clientA = Client::factory()->for($agencyA, 'agency')->create(['loyalty_points' => 15]);
        $clientB = Client::factory()->for($agencyB, 'agency')->create(['loyalty_points' => 15]);
        LoyaltyPointMovement::create([
            'client_id' => $clientA->id, 'agency_id' => $agencyA->id,
            'points' => 15, 'reason' => 'payment', 'created_at' => now()->subMonths(2),
        ]);
        LoyaltyPointMovement::create([
            'client_id' => $clientB->id, 'agency_id' => $agencyB->id,
            'points' => 15, 'reason' => 'payment', 'created_at' => now(),
        ]);

        $this->artisan('loyalty:expire-points');

        $this->assertSame(0, $clientA->refresh()->loyalty_points);
        $this->assertSame(15, $clientB->refresh()->loyalty_points);
    }
}
