<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Client\StoreClientRequest;
use App\Http\Requests\Client\UpdateClientRequest;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\LoyaltyTier;
use App\Models\OrderPickup;
use App\Models\AgencySetting;
use App\Models\LoyaltyPointMovement;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\TreatmentType;
use App\Services\ClientsExcelExporter;
use App\Services\KpiService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ClientController extends ApiController
{
    public function __construct(private readonly KpiService $kpi) {}

    #[OA\Get(
        path: '/clients',
        summary: 'Liste les clients (scopé à l\'agence sauf rôle global)',
        tags: ['Clients'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'agency_id', in: 'query', description: 'Rôle global uniquement', schema: new OA\Schema(type: 'integer')),
        ],
        responses: [new OA\Response(response: 200, description: 'Liste paginée des clients')]
    )]
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $query = $this->filteredQuery($request, $agencyId);
        if ($request->boolean('with_metrics')) {
            $this->withMetrics($query);
        }

        $clients = $query->orderBy('last_name')->paginate($request->integer('per_page', 20));

        if ($request->boolean('with_metrics')) {
            $tiers = $this->activeTiers($request->user()->pressing_id);
            $clients->getCollection()->transform(fn (Client $client) => $this->decorateMetrics($client, $tiers));
        }

        return response()->json($clients);
    }

    /** Export Excel du répertoire clients — mêmes filtres que la liste, jamais paginé. */
    public function export(Request $request, ClientsExcelExporter $exporter): StreamedResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $tiers = $this->activeTiers($request->user()->pressing_id);

        $query = $this->filteredQuery($request, $agencyId);
        $this->withMetrics($query);
        $clients = $query->orderBy('last_name')->limit(5000)->get()
            ->map(fn (Client $client) => $this->decorateMetrics($client, $tiers));

        return $exporter->download($clients);
    }

    /**
     * Filtres communs à la liste et à l'export : recherche (nom, téléphone, code
     * client CLI-xxxxx), palier de fidélité (bornes de dépenses 12 mois du palier),
     * statut actif/inactif, et activité (au moins un dépôt dans la période).
     *
     * @param  array<int>  $agencyId
     */
    private function filteredQuery(Request $request, array $agencyId): Builder
    {
        return Client::query()
            ->whereIn('agency_id', $agencyId)
            ->when($request->filled('search'), function ($query) use ($request) {
                $raw = trim($request->string('search')->value());
                $term = '%'.$raw.'%';
                $code = preg_match('/^(?:CLI-?)?0*(\d+)$/i', $raw, $m) && str_starts_with(strtoupper($raw), 'CLI') ? (int) $m[1] : null;
                $query->where(function ($q) use ($term, $code) {
                    $q->where('first_name', 'ilike', $term)
                        ->orWhere('last_name', 'ilike', $term)
                        ->orWhere('phone', 'ilike', $term);
                    if ($code !== null) {
                        $q->orWhere('id', $code);
                    }
                });
            })
            ->when($request->filled('status'), fn ($q) => $q->where('is_active', $request->string('status')->value() === 'active'))
            ->when($request->filled('tier_id'), function ($query) use ($request) {
                $tiers = $this->activeTiers($request->user()->pressing_id)->values();
                $index = $tiers->search(fn (LoyaltyTier $tier) => $tier->id === $request->integer('tier_id'));
                if ($index === false) {
                    $query->whereRaw('1 = 0');

                    return;
                }
                $query->where('loyalty_spend_12m', '>=', $tiers[$index]->min_spend_amount);
                if ($next = $tiers->get($index + 1)) {
                    $query->where('loyalty_spend_12m', '<', $next->min_spend_amount);
                }
            })
            ->when($request->filled('activity'), function ($query) use ($request) {
                $since = match ($request->string('activity')->value()) {
                    'week' => now()->startOfWeek(),
                    'month' => now()->startOfMonth(),
                    default => now()->startOfDay(),
                };
                $query->whereHas('orders', fn ($q) => $q->where('created_at', '>=', $since));
            });
    }

    /** Agrégats par client calculés en sous-requêtes (pas de N+1). */
    private function withMetrics(Builder $query): void
    {
        $query->with('agency:id,name')
            ->withMax('orders as last_order_at', 'created_at')
            ->withMin('orders as first_order_at', 'created_at')
            ->withCount(['orders as orders_12m_count' => fn ($q) => $q->where('created_at', '>=', now()->subYear())])
            ->withSum(['payments as lifetime_value' => fn ($q) => $q->where('status', 'complete')], 'amount');
    }

    /**
     * Fréquence = dépôts des 12 derniers mois rapportés au nombre de mois réellement
     * écoulés depuis l'inscription (plafonné à 12, au moins 1) — jamais une moyenne sur
     * une période où le client n'existait pas encore.
     */
    private function decorateMetrics(Client $client, Collection $tiers): Client
    {
        $months = $this->activeMonths($client, $client->first_order_at);
        $client->setAttribute('client_code', 'CLI-'.str_pad((string) $client->id, 5, '0', STR_PAD_LEFT));
        $client->setAttribute('orders_per_month', round(((int) $client->orders_12m_count) / $months, 1));
        $client->setAttribute('lifetime_value', (int) ($client->lifetime_value ?? 0));
        $tier = $tiers->filter(fn (LoyaltyTier $t) => $client->loyalty_spend_12m >= $t->min_spend_amount)->last();
        $client->setAttribute('tier_id', $tier?->id);

        return $client;
    }

    /**
     * Mois d'ancienneté réelle du client (plafonné à 12, au moins 1), depuis son
     * inscription ou son premier dépôt s'il est antérieur (clients importés).
     */
    private function activeMonths(Client $client, mixed $firstOrderAt): int
    {
        $start = $client->created_at;
        if ($firstOrderAt && \Illuminate\Support\Carbon::parse($firstOrderAt)->lt($start)) {
            $start = \Illuminate\Support\Carbon::parse($firstOrderAt);
        }

        return max(1, min(12, (int) ceil($start->diffInDays(now()) / 30)));
    }

    /** @return Collection<int, LoyaltyTier> */
    private function activeTiers(int $pressingId): Collection
    {
        return LoyaltyTier::query()->where('pressing_id', $pressingId)->where('is_active', true)->orderBy('min_spend_amount')->get();
    }

    /** KPI de la liste des clients, calculés uniquement à partir de données réelles. */
    public function stats(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $base = fn () => Client::query()->whereIn('agency_id', $agencyId);

        $topTier = LoyaltyTier::query()
            ->where('pressing_id', $request->user()->pressing_id)
            ->where('is_active', true)
            ->orderByDesc('min_spend_amount')
            ->first();

        $pressingId = $request->user()->pressing_id;
        $summary = $this->kpi->loyaltySummary($agencyId, now()->startOfMonth(), now(), $pressingId);
        $previous = $this->kpi->loyaltySummary($agencyId, now()->subMonthNoOverflow()->startOfMonth(), now()->subMonthNoOverflow()->endOfMonth(), $pressingId);

        return response()->json([
            'active_count' => $base()->where('is_active', true)->count(),
            'new_this_month' => $base()->where('created_at', '>=', now()->startOfMonth())->count(),
            'new_this_week' => $base()->where('created_at', '>=', now()->startOfWeek())->count(),
            'vip_count' => $topTier ? $base()->where('loyalty_spend_12m', '>=', $topTier->min_spend_amount)->count() : 0,
            'points_issued' => (int) $base()->sum('loyalty_points'),
            'points_issued_this_month' => $summary['points_issued'],
            'points_issued_previous_month' => $previous['points_issued'],
            // Répartition des clients actifs par palier courant — même calcul que la carte Fidélité des Rapports.
            'by_tier' => $summary['by_tier'],
        ]);
    }

    #[OA\Post(
        path: '/clients',
        summary: 'Crée un client',
        tags: ['Clients'],
        security: [['sanctum' => []]],
        responses: [new OA\Response(response: 201, description: 'Client créé')]
    )]
    public function store(StoreClientRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $data['agency_id']);

        $client = Client::create($data)->refresh();

        return response()->json($client, 201);
    }

    public function show(Request $request, Client $client): JsonResponse
    {
        $this->authorizeAgency($request->user(), $client->agency_id);
        $client->load('agency');

        $depositsCount = $client->orders()->count();
        $averageBasket = $depositsCount > 0 ? (int) round($client->orders()->avg('total_amount')) : 0;
        $lifetimeValue = (int) Payment::where('client_id', $client->id)->where('status', 'complete')->sum('amount');
        $balanceDue = (int) Invoice::where('client_id', $client->id)
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->withSum(['payments as paid_amount' => fn ($query) => $query->where('status', 'complete')], 'amount')
            ->get()
            ->sum(fn (Invoice $invoice) => max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0)));

        $recentPickups = OrderPickup::query()
            ->whereHas('order', fn ($query) => $query->where('client_id', $client->id))
            ->with('order:id,order_number')
            ->latest('processed_at')
            ->limit(10)
            ->get();

        $client->setAttribute('deposits_count', $depositsCount);
        $client->setAttribute('average_basket', $averageBasket);
        $client->setAttribute('lifetime_value', $lifetimeValue);
        $client->setAttribute('balance_due', $balanceDue);
        $client->setAttribute('recent_pickups', $recentPickups);

        $tiers = $this->activeTiers($request->user()->pressing_id);
        $ordersLast12m = $client->orders()->where('created_at', '>=', now()->subYear())->count();
        $months = $this->activeMonths($client, $client->orders()->min('created_at'));
        $client->setAttribute('client_code', 'CLI-'.str_pad((string) $client->id, 5, '0', STR_PAD_LEFT));
        $client->setAttribute('orders_per_month', round($ordersLast12m / $months, 1));
        $client->setAttribute('basket_trend', $this->basketTrend($client));
        $client->setAttribute('loyalty', $this->loyaltyBlock($client, $tiers));
        $client->setAttribute('preferences', $this->derivedPreferences($client));

        return response()->json($client);
    }

    /**
     * Évolution du panier moyen : 6 derniers mois vs les 6 mois précédents (null si
     * l'une des deux fenêtres est vide — jamais une variation calculée contre zéro).
     */
    private function basketTrend(Client $client): ?float
    {
        $recent = $client->orders()->where('status', '!=', 'annule')->where('created_at', '>=', now()->subMonths(6))->avg('total_amount');
        $before = $client->orders()->where('status', '!=', 'annule')->whereBetween('created_at', [now()->subMonths(12), now()->subMonths(6)])->avg('total_amount');

        return $recent && $before ? round(($recent - $before) / $before * 100, 1) : null;
    }

    /**
     * Bloc fidélité : solde de points, valeur indicative (valeur du point de l'agence
     * si configurée), palier courant et suivant par dépenses 12 mois, derniers mouvements.
     */
    private function loyaltyBlock(Client $client, Collection $tiers): array
    {
        $current = $tiers->filter(fn (LoyaltyTier $t) => $client->loyalty_spend_12m >= $t->min_spend_amount)->last();
        $next = $tiers->first(fn (LoyaltyTier $t) => $t->min_spend_amount > $client->loyalty_spend_12m);
        $pointValue = AgencySetting::forAgency($client->agency_id)->loyalty_point_value_fcfa;

        $floor = $current?->min_spend_amount ?? 0;
        $progress = $next ? (int) round(($client->loyalty_spend_12m - $floor) / max(1, $next->min_spend_amount - $floor) * 100) : 100;

        return [
            'points' => (int) $client->loyalty_points,
            'point_value_fcfa' => $pointValue,
            'points_value' => $pointValue ? (int) $client->loyalty_points * $pointValue : null,
            'spend_12m' => (int) $client->loyalty_spend_12m,
            'current_tier' => $current ? ['id' => $current->id, 'name' => $current->name] : null,
            'next_tier' => $next ? ['id' => $next->id, 'name' => $next->name, 'remaining' => (int) ($next->min_spend_amount - $client->loyalty_spend_12m)] : null,
            'progress' => max(0, min(100, $progress)),
            'movements' => LoyaltyPointMovement::query()
                ->where('client_id', $client->id)
                ->with('payment:id,invoice_id')
                ->latest('created_at')
                ->limit(6)
                ->get(['id', 'payment_id', 'points', 'reason', 'expired_at', 'created_at']),
        ];
    }

    /**
     * Préférences dérivées de l'historique réel : traitement le plus utilisé sur les
     * lignes de dépôt, et créneau horaire de retrait le plus fréquent. `null` tant que
     * l'historique ne permet pas de conclure (jamais une préférence devinée).
     */
    private function derivedPreferences(Client $client): array
    {
        $favorite = OrderItem::query()
            ->whereNotNull('treatment_type_id')
            ->whereHas('order', fn ($q) => $q->where('client_id', $client->id))
            ->selectRaw('treatment_type_id, count(*) as uses')
            ->groupBy('treatment_type_id')
            ->orderByDesc('uses')
            ->first();

        $hours = OrderPickup::query()
            ->whereHas('order', fn ($q) => $q->where('client_id', $client->id))
            ->pluck('processed_at')
            ->filter()
            ->map(fn ($at) => match (true) {
                $at->hour < 12 => 'morning',
                $at->hour < 14 => 'midday',
                $at->hour < 17 => 'afternoon',
                default => 'evening',
            });

        return [
            'favorite_treatment' => $favorite ? TreatmentType::find($favorite->treatment_type_id)?->name : null,
            'pickup_slot' => $hours->isEmpty() ? null : $hours->countBy()->sortDesc()->keys()->first(),
        ];
    }

    public function notes(Request $request, Client $client): JsonResponse
    {
        $this->authorizeAgency($request->user(), $client->agency_id);

        return response()->json($client->internalNotes()->with('author:id,name')->limit(50)->get());
    }

    public function storeNote(Request $request, Client $client): JsonResponse
    {
        $this->authorizeAgency($request->user(), $client->agency_id);
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $note = $client->internalNotes()->create(['body' => $data['body'], 'user_id' => $request->user()->id]);

        return response()->json($note->load('author:id,name'), 201);
    }

    public function update(UpdateClientRequest $request, Client $client): JsonResponse
    {
        $this->authorizeAgency($request->user(), $client->agency_id);

        $client->update($request->validated());

        return response()->json($client);
    }

    #[OA\Delete(
        path: '/clients/{client}',
        summary: 'Supprime un client (refusé s\'il a des commandes : désactivez-le plutôt)',
        tags: ['Clients'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 204, description: 'Client supprimé'),
            new OA\Response(response: 409, description: 'Le client a des commandes : suppression refusée'),
        ]
    )]
    public function destroy(Request $request, Client $client): JsonResponse
    {
        $this->authorizeAgency($request->user(), $client->agency_id);
        $this->authorizePermission($request->user(), 'clients.manage');

        if ($client->orders()->exists()) {
            throw new HttpException(409, "Ce client a des commandes : impossible de le supprimer. Désactivez-le plutôt.");
        }

        $client->delete();

        return response()->json(status: 204);
    }
}
