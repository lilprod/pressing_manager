<?php

namespace App\Http\Controllers\Api;

use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class UserController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        // Listing du personnel utilisé par les modules Livraisons (choix du livreur) et RH (planning) —
        // toute permission de gestion d'agence suffit à consulter la liste, pas seulement l'une des deux.
        if (! $request->user()->hasPermission('deliveries.manage') && ! $request->user()->hasPermission('hr.manage')) {
            throw new HttpException(403, 'Permission manquante.');
        }

        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $users = User::query()
            ->select('id', 'name', 'agency_id')
            ->where('is_active', true)
            ->when($request->filled('role'), function ($query) use ($request) {
                $roleId = Role::where('slug', $request->string('role')->value())->value('id');
                $query->where('role_id', $roleId);
            })
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }
}
