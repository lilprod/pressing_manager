<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Service\StoreServiceRequest;
use App\Http\Requests\Service\UpdateAgencyServicePricingRequest;
use App\Http\Requests\Service\UpdateServiceRequest;
use App\Models\Agency;
use App\Models\Service;
use App\Models\ServicePriceHistory;
use App\Models\TreatmentType;
use App\Models\User;
use App\Services\ServicePricingService;
use App\Services\ServicesExcelExporter;
use App\Services\ServicesExcelImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ServiceController extends ApiController
{
    public function __construct(private readonly ServicePricingService $pricing) {}

    /**
     * Catalogue de services actifs pour une agence, avec le tarif effectif
     * (surcharge d'agence si définie, sinon tarif de base).
     */
    public function index(Request $request): JsonResponse
    {
        $agencyId = $request->user()->agency_id ?? $request->integer('agency_id');

        if (! $agencyId) {
            throw new HttpException(422, "Paramètre 'agency_id' requis pour un rôle global.");
        }

        $this->authorizeAgency($request->user(), $agencyId);

        $agency = Agency::findOrFail($agencyId);
        $services = $agency->services()
            ->wherePivot('is_active', true)
            ->where('services.is_active', true)
            ->with('priceTiers')
            ->get()
            ->map(function ($service) {
                $service->effective_price = $service->pivot->price_override ?? $service->base_price;

                return $service;
            });

        return response()->json($services);
    }

    /**
     * Catalogue complet de services (tous, actifs ou non), pour l'écran de gestion
     * back-office. Paginé, filtrable par catégorie, mode de facturation, disponibilité
     * et par recherche (nom/code), triable (nom/dernière modification/prix). Si un
     * agency_id est fourni, chaque service embarque la surcharge
     * (price_override/is_active) de cette agence sous "agency_pivot". Chaque service
     * embarque aussi sa disponibilité réseau (available_agencies_count/
     * total_agencies_count) et, pour les articles à la pièce, un prix par traitement
     * actif (treatment_prices) — voir CLAUDE.md, audit Figma 2026-10-06.
     */
    public function catalog(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');

        $pressingId = $request->user()->pressing_id;
        $agencyId = $request->integer('agency_id') ?: null;

        $sort = in_array($request->string('sort')->value(), ['name', 'updated_at', 'base_price'], true)
            ? $request->string('sort')->value()
            : 'name';
        $direction = $sort === 'name' ? 'asc' : 'desc';

        $query = Service::where('pressing_id', $pressingId)
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')->value()))
            ->when($request->filled('billing_mode'), fn ($q) => $q->where('billing_mode', $request->string('billing_mode')->value()))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search')->value().'%';
                $q->where(fn ($qq) => $qq->where('name', 'ilike', $term)->orWhere('code', 'ilike', $term));
            })
            // Onglet "Indisponibles" : inactif OU disponible dans aucune agence active.
            ->when($request->boolean('only_unavailable'), function ($q) {
                $q->where(fn ($qq) => $qq->where('is_active', false)
                    ->orWhereDoesntHave('agencies', fn ($aq) => $aq->where('agency_services.is_active', true)));
            })
            ->withCount(['agencies as available_agencies_count' => fn ($q) => $q->where('agency_services.is_active', true)])
            ->with('priceTiers')
            ->orderBy($sort, $direction);

        $paginated = $query->paginate($request->integer('per_page', 20));
        $services = $paginated->getCollection();

        if ($agencyId) {
            $this->authorizeAgency($request->user(), $agencyId);

            $overrides = Agency::findOrFail($agencyId)->services()->get()->keyBy('id');

            $services = $services->map(function (Service $service) use ($overrides) {
                $pivot = $overrides->get($service->id)?->pivot;
                $service->agency_pivot = $pivot ? ['price_override' => $pivot->price_override, 'is_active' => $pivot->is_active] : null;

                return $service;
            });
        }

        $totalAgenciesCount = Agency::where('pressing_id', $pressingId)->where('is_active', true)->count();
        $treatmentTypes = TreatmentType::where('pressing_id', $pressingId)->where('is_active', true)->get();

        $services = $services->map(function (Service $service) use ($totalAgenciesCount, $treatmentTypes) {
            $service->total_agencies_count = $totalAgenciesCount;

            // Un prix par traitement n'a de sens que pour un article à la pièce (ou
            // mixte, qui autorise aussi un prix pièce) avec un prix de base réel — un
            // article exclusivement au kilo exigerait un poids de référence fabriqué,
            // conserve donc l'affichage existant "Dès X FCFA/kg" dans ce cas.
            $service->treatment_prices = ($service->billing_mode !== 'kg' && $service->base_price !== null)
                ? $treatmentTypes->mapWithKeys(fn (TreatmentType $tt) => [
                    $tt->code => $this->pricing->roundAmount($service, $this->pricing->applyTreatmentRatio($service->base_price, $tt)),
                ])
                : null;

            return $service;
        });

        $paginated->setCollection($services);

        return response()->json($paginated);
    }

    /** Export Excel du catalogue, mêmes filtres que catalog() (sauf pagination). */
    public function export(Request $request, ServicesExcelExporter $exporter): StreamedResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');

        $pressingId = $request->user()->pressing_id;
        $totalAgenciesCount = Agency::where('pressing_id', $pressingId)->where('is_active', true)->count();

        $services = Service::where('pressing_id', $pressingId)
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')->value()))
            ->when($request->filled('billing_mode'), fn ($q) => $q->where('billing_mode', $request->string('billing_mode')->value()))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search')->value().'%';
                $q->where(fn ($qq) => $qq->where('name', 'ilike', $term)->orWhere('code', 'ilike', $term));
            })
            ->withCount(['agencies as available_agencies_count' => fn ($q) => $q->where('agency_services.is_active', true)])
            ->orderBy('name')
            ->get()
            ->each(fn (Service $s) => $s->total_agencies_count = $totalAgenciesCount);

        return $exporter->download($services);
    }

    /** Import Excel du catalogue (articles à la pièce uniquement, voir ServicesExcelImporter). */
    public function import(Request $request, ServicesExcelImporter $importer): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');
        $request->validate(['file' => ['required', 'file', 'mimes:xlsx,xls,csv']]);

        $result = $importer->import($request->file('file')->getRealPath(), $request->user(), $this->pricing);

        return response()->json($result, empty($result['errors']) ? 201 : 422);
    }

    /** Duplique un article (champs + grille de prix), sans son historique. */
    public function duplicate(Request $request, Service $service): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');
        $this->authorizeService($request->user(), $service);

        $data = $service->only([
            'category', 'billing_mode', 'description', 'base_price', 'estimated_duration_hours',
            'priority', 'allow_discount', 'round_to_hundred', 'price_editable_at_counter',
        ]);
        $data['name'] = $service->name.' (copie)';
        $data['code'] = $this->uniqueDuplicateCode($service->code, $request->user()->pressing_id);
        $data['is_active'] = false; // Copie inactive par défaut : à revoir avant publication, jamais calquée telle quelle.
        $data['price_tiers'] = $service->priceTiers->map(fn ($t) => [
            'weight_min' => $t->weight_min, 'weight_max' => $t->weight_max, 'price_per_kg' => $t->price_per_kg,
        ])->all();

        $duplicate = $this->pricing->createService($data, $request->user());

        return response()->json($duplicate, 201);
    }

    private function uniqueDuplicateCode(string $baseCode, int $pressingId): string
    {
        $candidate = "{$baseCode}-COPIE";
        $suffix = 1;
        while (Service::where('pressing_id', $pressingId)->where('code', $candidate)->exists()) {
            $suffix++;
            $candidate = "{$baseCode}-COPIE-{$suffix}";
        }

        return $candidate;
    }

    /** Historique complet des changements de tarif du pressing (onglet "Historique"). */
    public function priceHistory(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');

        $history = ServicePriceHistory::query()
            ->whereHas('service', fn ($q) => $q->where('pressing_id', $request->user()->pressing_id))
            ->with(['service:id,name,code', 'actor:id,name'])
            ->orderByDesc('changed_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json($history);
    }

    /**
     * Détail d'un service pour l'écran de création/édition. Si un agency_id est
     * fourni, embarque la surcharge (price_override/is_active) de cette agence
     * sous "agency_pivot", comme le fait catalog().
     */
    public function show(Request $request, Service $service): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');
        $this->authorizeService($request->user(), $service);

        $agencyId = $request->integer('agency_id') ?: null;

        if ($agencyId) {
            $this->authorizeAgency($request->user(), $agencyId);

            $pivot = Agency::findOrFail($agencyId)->services()->find($service->id)?->pivot;
            $service->agency_pivot = $pivot ? ['price_override' => $pivot->price_override, 'is_active' => $pivot->is_active] : null;
        }

        return response()->json($service->load('priceTiers', 'priceHistories.actor'));
    }

    public function store(StoreServiceRequest $request): JsonResponse
    {
        $service = $this->pricing->createService($request->validated(), $request->user());

        return response()->json($service, 201);
    }

    public function update(UpdateServiceRequest $request, Service $service): JsonResponse
    {
        $this->authorizeService($request->user(), $service);

        $service = $this->pricing->updateService($service, $request->validated(), $request->user());

        return response()->json($service);
    }

    /**
     * Tableau de bord du catalogue : actifs, catégories, tarif moyen, "à réviser",
     * plus les tendances réelles (nouveaux articles ce mois-ci, évolution du tarif
     * moyen sur 30 jours) et l'horodatage de dernière modification du catalogue —
     * pattern 100% frontend pour les deltas eux-mêmes (percentChange(), comme
     * KpiPage.tsx/DashboardPage.tsx), ce endpoint ne fait que fournir les deux
     * valeurs réelles à comparer.
     */
    public function stats(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');

        $pressingId = $request->user()->pressing_id;
        $pieceServices = Service::where('pressing_id', $pressingId)->where('billing_mode', '!=', 'kg')->get(['id', 'base_price']);

        return response()->json([
            'active_count' => Service::where('pressing_id', $pressingId)->where('is_active', true)->count(),
            'category_count' => Service::where('pressing_id', $pressingId)->distinct('category')->count('category'),
            'average_base_price' => (int) round($pieceServices->avg('base_price') ?? 0),
            'average_base_price_30d_ago' => (int) round($this->averageBasePrice30DaysAgo($pieceServices)),
            'stale_count' => Service::where('pressing_id', $pressingId)->where('updated_at', '<', now()->subMonths(12))->count(),
            'created_this_month_count' => Service::where('pressing_id', $pressingId)->where('created_at', '>=', now()->startOfMonth())->count(),
            'catalog_updated_at' => Service::where('pressing_id', $pressingId)->max('updated_at'),
        ]);
    }

    /**
     * Moyenne reconstituée des prix de base "il y a 30 jours", via ServicePriceHistory
     * (champ 'base_price' uniquement). Pour chaque article, valeur du dernier
     * changement antérieur au cap J-30 (new_value) ; si aucun changement n'est
     * antérieur à ce cap (jamais modifié, ou modifié seulement récemment), repli sur
     * le prix actuel — simplification assumée plutôt qu'une reconstruction exacte
     * (qui exigerait de remonter à l'old_value du tout premier changement).
     */
    private function averageBasePrice30DaysAgo($pieceServices): float
    {
        if ($pieceServices->isEmpty()) {
            return 0;
        }

        $cutoff = now()->subDays(30);
        $pastValues = ServicePriceHistory::whereIn('service_id', $pieceServices->pluck('id'))
            ->where('field', 'base_price')
            ->where('changed_at', '<=', $cutoff)
            ->orderByDesc('changed_at')
            ->get()
            ->groupBy('service_id')
            ->map(fn ($rows) => (float) $rows->first()->new_value);

        return $pieceServices
            ->map(fn (Service $s) => $pastValues->get($s->id, (float) $s->base_price))
            ->avg();
    }

    /** `Service` n'a pas d'`agency_id` (catalogue par pressing, voir CLAUDE.md) — vérification directe. */
    private function authorizeService(User $user, Service $service): void
    {
        if ($service->pressing_id !== $user->pressing_id) {
            throw new HttpException(403, "Vous n'avez pas accès à cet article.");
        }
    }

    /**
     * Définit/retire la surcharge de tarif ou d'activation d'un service pour une agence
     * donnée (table pivot agency_services).
     */
    public function updatePricing(UpdateAgencyServicePricingRequest $request, Agency $agency, Service $service): JsonResponse
    {
        $this->authorizeAgency($request->user(), $agency->id);
        $this->authorizeService($request->user(), $service);

        $agency->services()->syncWithoutDetaching([
            $service->id => $request->validated(),
        ]);

        return response()->json([
            'agency_id' => $agency->id,
            'service_id' => $service->id,
            ...$request->validated(),
        ]);
    }
}
