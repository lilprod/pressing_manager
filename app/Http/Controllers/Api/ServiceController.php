<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Service\StoreServiceRequest;
use App\Http\Requests\Service\UpdateAgencyServicePricingRequest;
use App\Http\Requests\Service\UpdateServiceRequest;
use App\Models\Agency;
use App\Models\Service;
use App\Models\User;
use App\Services\ServicePricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
     * back-office. Paginé, filtrable par catégorie et par recherche (nom/code).
     * Si un agency_id est fourni, chaque service embarque la surcharge
     * (price_override/is_active) de cette agence sous "agency_pivot".
     */
    public function catalog(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');

        $agencyId = $request->integer('agency_id') ?: null;

        $paginated = Service::where('pressing_id', $request->user()->pressing_id)
            ->when($request->filled('category'), fn ($query) => $query->where('category', $request->string('category')->value()))
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.$request->string('search')->value().'%';
                $query->where(fn ($q) => $q->where('name', 'ilike', $term)->orWhere('code', 'ilike', $term));
            })
            ->with('priceTiers')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

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

        $paginated->setCollection($services);

        return response()->json($paginated);
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

    /** Tableau de bord du catalogue : actifs, catégories, tarif moyen, "à réviser". */
    public function stats(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');

        $pressingId = $request->user()->pressing_id;

        return response()->json([
            'active_count' => Service::where('pressing_id', $pressingId)->where('is_active', true)->count(),
            'category_count' => Service::where('pressing_id', $pressingId)->distinct('category')->count('category'),
            'average_base_price' => (int) round(Service::where('pressing_id', $pressingId)->where('billing_mode', '!=', 'kg')->avg('base_price') ?? 0),
            'stale_count' => Service::where('pressing_id', $pressingId)->where('updated_at', '<', now()->subMonths(12))->count(),
        ]);
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
