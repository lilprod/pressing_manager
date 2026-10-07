<?php

namespace Tests\Feature\Clients;

use App\Models\Agency;
use App\Models\Client;
use App\Models\Order;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ClientLifecycleTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    public function test_an_accueil_can_create_a_client_without_specifying_loyalty_points(): void
    {
        // Régression : Client::create() ne reflète pas les défauts DB de loyalty_points/
        // loyalty_spend_12m (0) en mémoire, ce qui faisait planter l'accesseur
        // loyaltyDiscountRate() (where('min_spend_amount', '<=', null) → "Illegal operator
        // and value combination") lors de la sérialisation JSON de la réponse. Voir
        // ClientController::store() (->refresh() après create()).
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/clients', [
            'first_name' => 'Jean',
            'last_name' => 'Dupont',
            'phone' => '+228 90 11 22 33',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('loyalty_points', 0);
        $this->assertSame(0.0, (float) $response->json('loyalty_discount_rate'));
    }

    public function test_a_client_without_orders_can_be_deleted(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $response = $this->actingAs($accueil)->deleteJson("/api/clients/{$client->id}");

        $response->assertNoContent();
        $this->assertSoftDeleted('clients', ['id' => $client->id]);
    }

    public function test_a_client_with_orders_cannot_be_deleted(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();
        Order::factory()->for($agency, 'agency')->for($client, 'client')->create();

        $response = $this->actingAs($accueil)->deleteJson("/api/clients/{$client->id}");

        $response->assertStatus(409);
        $this->assertDatabaseHas('clients', ['id' => $client->id, 'deleted_at' => null]);
    }

    public function test_a_client_can_be_deactivated_and_reactivated(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create(['is_active' => true]);

        $this->actingAs($accueil)
            ->patchJson("/api/clients/{$client->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('is_active', false);

        $this->actingAs($accueil)
            ->patchJson("/api/clients/{$client->id}", ['is_active' => true])
            ->assertOk()
            ->assertJsonPath('is_active', true);
    }

    public function test_an_accueil_can_create_a_client_with_the_extended_profile_fields(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/clients', [
            'first_name' => 'Aminata',
            'last_name' => 'Koné',
            'phone' => '+225 07 48 22 16 03',
            'phone_secondary' => '+225 05 07 28 44 91',
            'email' => 'aminata.kone@gmail.com',
            'address' => 'Résidence Les Lauriers, villa 12',
            'city' => 'Bingerville — Faya',
            'contact_preference' => 'whatsapp',
            'referral_code' => 'AWA-2024',
            'sms_consent' => true,
            'email_consent' => false,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('phone_secondary', '+225 05 07 28 44 91');
        $response->assertJsonPath('city', 'Bingerville — Faya');
        $response->assertJsonPath('contact_preference', 'whatsapp');
        $response->assertJsonPath('referral_code', 'AWA-2024');
        $response->assertJsonPath('sms_consent', true);
        $response->assertJsonPath('email_consent', false);
        $this->assertDatabaseHas('clients', ['phone' => '+225 07 48 22 16 03', 'referral_code' => 'AWA-2024']);
    }

    public function test_the_extended_profile_fields_default_to_empty_without_consent(): void
    {
        // Un client créé sans préciser les nouveaux champs ne doit jamais se voir attribuer un
        // consentement implicite : sms_consent/email_consent restent false par défaut (colonne DB).
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $response = $this->actingAs($accueil)->postJson('/api/clients', [
            'first_name' => 'Jean',
            'last_name' => 'Dupont',
            'phone' => '+228 90 11 22 33',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('sms_consent', false);
        $response->assertJsonPath('email_consent', false);
        $response->assertJsonPath('phone_secondary', null);
        $response->assertJsonPath('contact_preference', null);
    }

    public function test_an_invalid_contact_preference_is_rejected(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);

        $this->actingAs($accueil)->postJson('/api/clients', [
            'first_name' => 'Jean',
            'last_name' => 'Dupont',
            'phone' => '+228 90 11 22 33',
            'contact_preference' => 'fax',
        ])->assertStatus(422);
    }

    public function test_updating_a_client_can_set_the_extended_profile_fields(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $accueil = $this->makeUser('accueil', $agency);
        $client = Client::factory()->for($agency, 'agency')->create();

        $this->actingAs($accueil)
            ->patchJson("/api/clients/{$client->id}", [
                'city' => 'Cocody Angré',
                'contact_preference' => 'sms',
                'sms_consent' => true,
                'email_consent' => true,
            ])
            ->assertOk()
            ->assertJsonPath('city', 'Cocody Angré')
            ->assertJsonPath('contact_preference', 'sms')
            ->assertJsonPath('sms_consent', true)
            ->assertJsonPath('email_consent', true);
    }
}
