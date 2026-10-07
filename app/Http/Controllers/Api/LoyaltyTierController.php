<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Loyalty\StoreLoyaltyTierRequest;
use App\Http\Requests\Loyalty\UpdateLoyaltyTierRequest;
use App\Models\Client;
use App\Models\LoyaltyPointMovement;
use App\Models\LoyaltyTier;
use App\Services\KpiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Référentiel par pressing (pas par agence), même portée que le catalogue d'articles
 * et les types de traitement — voir CLAUDE.md « Pivot multi-tenant » / « Chantier D.1 ».
 *
 * Audit « Promotions et fidélité » (CLAUDE.md) : trois endpoints ajoutés pour
 * l'écran `/loyalty` (stats, mouvements, segments), qui n'exposait jusqu'ici que les
 * paliers eux-mêmes — toutes les agrégations réutilisent les mêmes formules que le
 * KPI « Fidélité » (`KpiService::loyaltySummary()`) plutôt que de les redériver.
 */
class LoyaltyTierController extends ApiController
{
    public function __construct(private readonly KpiService $kpi) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(
            LoyaltyTier::where('pressing_id', $request->user()->pressing_id)->orderBy('min_spend_amount')->get()
        );
    }

    public function store(StoreLoyaltyTierRequest $request): JsonResponse
    {
        return response()->json(LoyaltyTier::create([
            ...$request->validated(),
            'pressing_id' => $request->user()->pressing_id,
        ]), 201);
    }

    public function update(UpdateLoyaltyTierRequest $request, LoyaltyTier $loyaltyTier): JsonResponse
    {
        if ($loyaltyTier->pressing_id !== $request->user()->pressing_id) {
            throw new HttpException(403, "Vous n'avez pas accès à ce palier de fidélité.");
        }

        $loyaltyTier->update($request->validated());

        return response()->json($loyaltyTier);
    }

    /**
     * KPI de l'écran Fidélité (« Membres actifs », « Points émis », « Points
     * expirés », « Remises accordées »). `points_consumed` de `loyaltySummary()` est
     * exposé ici sous `points_expired` — nom honnête : aujourd'hui ce total ne
     * contient que des expirations (`reason=expired`), aucun mécanisme de redemption
     * volontaire de points n'existe, voir CLAUDE.md.
     */
    public function stats(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'clients.manage');
        $agencyIds = $this->resolveAgencyFilter($request, $request->user());

        $from = $request->filled('from') ? Carbon::parse($request->string('from')->value())->startOfDay() : now()->startOfMonth();
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->value())->endOfDay() : now()->endOfDay();

        $summary = $this->kpi->loyaltySummary($agencyIds, $from, $to, $request->user()->pressing_id);

        $discountsGranted = (int) \App\Models\Order::query()
            ->whereIn('agency_id', $agencyIds)
            ->whereBetween('created_at', [$from, $to])
            ->sum('loyalty_discount_amount');

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'members_active' => array_sum(array_column($summary['by_tier'], 'count')),
            'by_tier' => $summary['by_tier'],
            'points_issued' => $summary['points_issued'],
            'points_expired' => $summary['points_consumed'],
            'discounts_granted' => $discountsGranted,
        ]);
    }

    /**
     * Derniers mouvements de points (crédit paiement, expiration) — ledger réel
     * `loyalty_point_movements`, voir CLAUDE.md « Historique des mouvements ». Aucun
     * motif « bonus de palier » ni « rédemption manuelle » : ces mécanismes
     * n'existent pas, ils ne figurent donc jamais dans cette liste plutôt que d'être
     * simulés.
     */
    public function movements(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'clients.manage');
        $agencyIds = $this->resolveAgencyFilter($request, $request->user());

        $movements = LoyaltyPointMovement::query()
            ->whereIn('agency_id', $agencyIds)
            ->with(['client:id,first_name,last_name', 'payment:id,amount'])
            ->latest('created_at')
            ->limit($request->integer('limit', 10))
            ->get()
            ->map(fn (LoyaltyPointMovement $m) => [
                'id' => $m->id,
                'client_name' => trim(($m->client->first_name ?? '').' '.($m->client->last_name ?? '')),
                'reason' => $m->reason,
                'points' => $m->points,
                'created_at' => $m->created_at->toIso8601String(),
            ]);

        return response()->json($movements);
    }

    /**
     * Segments de « Groupes de fidélité » — chacun dérivé d'une donnée réelle, voir
     * CLAUDE.md. Le seuil de 90 jours (réactivation) et de 20 % (proche d'une
     * récompense) sont des choix arbitraires documentés (absents de la maquette),
     * pas une valeur mesurée.
     */
    public function segments(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'clients.manage');
        $agencyIds = $this->resolveAgencyFilter($request, $request->user());
        $pressingId = $request->user()->pressing_id;

        $tiers = LoyaltyTier::where('pressing_id', $pressingId)->where('is_active', true)->orderBy('min_spend_amount')->get();
        $topTwoThresholds = $tiers->count() >= 2 ? $tiers->slice(-2)->first()->min_spend_amount : ($tiers->last()?->min_spend_amount ?? PHP_INT_MAX);

        $base = fn () => Client::query()->whereIn('agency_id', $agencyIds)->where('is_active', true);

        $topTierMembers = (clone $base())->where('loyalty_spend_12m', '>=', $topTwoThresholds)->count();

        $reactivation = (clone $base())
            ->where('loyalty_spend_12m', '>', 0)
            ->whereDoesntHave('orders', fn ($q) => $q->where('created_at', '>=', now()->subDays(90)))
            ->count();

        $newMembers = (clone $base())->where('created_at', '>=', now()->subDays(30))->count();

        // « Proches d'une récompense » : dépense à moins de 20 % du seuil du palier
        // suivant, pour les clients qui n'ont pas encore atteint le palier le plus haut.
        $nearReward = 0;
        foreach ($tiers as $index => $tier) {
            $next = $tiers->get($index + 1);
            if (! $next) {
                continue;
            }
            $gapThreshold = $next->min_spend_amount - ($next->min_spend_amount - $tier->min_spend_amount) * 0.2;
            $nearReward += (clone $base())
                ->where('loyalty_spend_12m', '>=', $gapThreshold)
                ->where('loyalty_spend_12m', '<', $next->min_spend_amount)
                ->count();
        }

        return response()->json([
            'top_tier_members' => $topTierMembers,
            'reactivation_90d' => $reactivation,
            'near_reward' => $nearReward,
            'new_members_30d' => $newMembers,
        ]);
    }
}
