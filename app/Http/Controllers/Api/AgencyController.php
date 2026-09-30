<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Agency\StoreAgencyRequest;
use App\Http\Requests\Agency\UpdateAgencyRequest;
use App\Models\Agency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgencyController extends ApiController
{
    /**
     * Liste des agences actives, utilisée par le sélecteur d'agence des rôles globaux
     * et pour résoudre le nom/code d'agence dans l'interface.
     */
    public function index(): JsonResponse
    {
        return response()->json(Agency::where('is_active', true)->orderBy('name')->get());
    }

    /**
     * Liste paginée de toutes les agences (actives et inactives), pour l'écran de
     * gestion back-office. Filtrable par recherche (nom/code).
     */
    public function manage(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');

        $agencies = Agency::query()
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.$request->string('search')->value().'%';
                $query->where(fn ($q) => $q->where('name', 'ilike', $term)->orWhere('code', 'ilike', $term));
            })
            ->withCount(['users', 'clients'])
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        return response()->json($agencies);
    }

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizePermission($request->user(), 'agencies.manage');

        return response()->json($agency->loadCount(['users', 'clients']));
    }

    public function store(StoreAgencyRequest $request): JsonResponse
    {
        // ->refresh() : unclaimed_item_threshold_days a un défaut DB (30) qui n'est pas
        // reflété en mémoire si le champ n'est pas fourni explicitement (voir CLAUDE.md).
        $agency = Agency::create($request->validated())->refresh();

        return response()->json($agency, 201);
    }

    public function update(UpdateAgencyRequest $request, Agency $agency): JsonResponse
    {
        $agency->update($request->validated());

        return response()->json($agency);
    }
}
