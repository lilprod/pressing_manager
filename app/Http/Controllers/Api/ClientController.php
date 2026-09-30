<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Client\StoreClientRequest;
use App\Http\Requests\Client\UpdateClientRequest;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ClientController extends ApiController
{
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

        $clients = Client::query()
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.$request->string('search')->value().'%';
                $query->where(fn ($q) => $q->where('first_name', 'ilike', $term)
                    ->orWhere('last_name', 'ilike', $term)
                    ->orWhere('phone', 'ilike', $term));
            })
            ->orderBy('last_name')
            ->paginate($request->integer('per_page', 20));

        return response()->json($clients);
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

        $client = Client::create($data)->refresh();

        return response()->json($client, 201);
    }

    public function show(Request $request, Client $client): JsonResponse
    {
        $this->authorizeAgency($request->user(), $client->agency_id);

        return response()->json($client->load('agency'));
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
