<?php

namespace Tests\Feature\Loyalty;

use App\Console\Commands\RecalculateLoyaltySpend;
use App\Models\Agency;
use App\Models\Client;
use App\Models\LoyaltyTier;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md) : bascule du critère de palier, des
 * points cumulés perpétuels vers les dépenses glissantes sur 12 mois
 * (`clients.loyalty_spend_12m`). Les points (`loyalty_points`) restent une monnaie
 * séparée (acquisition/valeur de redemption), voir LoyaltyTest.php pour cette partie
 * inchangée.
 */
class LoyaltySpendTierTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_a_cash_payment_increments_the_rolling_12_month_spend(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 0]);

        $this->actingAs($accueil)->postJson('/api/payments/cash', [
            'client_id' => $client->id,
            'amount' => 25000,
        ])->assertCreated();

        $this->assertSame(25000, $client->refresh()->loyalty_spend_12m);
    }

    public function test_the_rolling_spend_accumulates_across_several_payments(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 0]);

        $this->actingAs($accueil)->postJson('/api/payments/cash', ['client_id' => $client->id, 'amount' => 10000])->assertCreated();
        $this->actingAs($accueil)->postJson('/api/payments/cash', ['client_id' => $client->id, 'amount' => 15000])->assertCreated();

        $this->assertSame(25000, $client->refresh()->loyalty_spend_12m);
    }

    public function test_a_client_resolves_its_tier_from_spend_not_from_point_balance(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        LoyaltyTier::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Argent', 'min_spend_amount' => 100000, 'discount_rate' => 0.05]);
        // Beaucoup de points (monnaie séparée) mais peu de dépenses réelles sur 12 mois —
        // ne doit jamais atteindre le palier par les points seuls.
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_points' => 99999, 'loyalty_spend_12m' => 50000]);

        $response = $this->actingAs($accueil)->getJson("/api/clients/{$client->id}");

        $response->assertOk();
        $response->assertJsonPath('loyalty_tier_name', null);
    }

    public function test_point_multiplier_and_benefit_description_are_persisted(): void
    {
        $this->seedRbac();
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin)->postJson('/api/loyalty-tiers', [
            'name' => 'Or',
            'min_spend_amount' => 300000,
            'discount_rate' => 0.10,
            'point_multiplier' => 1.25,
            'benefit_description' => 'Priorité & retouches',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('point_multiplier', 1.25);
        $response->assertJsonPath('benefit_description', 'Priorité & retouches');
    }

    public function test_recalculate_command_excludes_payments_older_than_12_months(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $client = Client::factory()->for($agency, 'agency')->create(['loyalty_spend_12m' => 0]);

        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 40000, 'currency' => 'XOF', 'status' => 'complete', 'paid_at' => now()->subMonths(2),
        ]);
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 999999, 'currency' => 'XOF', 'status' => 'complete', 'paid_at' => now()->subMonths(14),
        ]);
        // Impayé : ne doit jamais compter.
        Payment::create([
            'agency_id' => $agency->id, 'client_id' => $client->id, 'method' => 'espece',
            'amount' => 50000, 'currency' => 'XOF', 'status' => 'en_attente', 'paid_at' => now(),
        ]);

        $this->artisan(RecalculateLoyaltySpend::class)->assertExitCode(0);

        $this->assertSame(40000, $client->refresh()->loyalty_spend_12m);
    }
}
