<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Promotion\StorePromotionRequest;
use App\Http\Requests\Promotion\UpdatePromotionRequest;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Audit « Promotions et fidélité » (CLAUDE.md, node Figma 72:20021) : contrôleur
 * entièrement nouveau, le volet promotions n'existait pas côté backend. Référentiel
 * pressing-scopé (même portée que `LoyaltyTierController`), permission `clients.manage`
 * — même gate que le reste de l'écran Fidélité dont ce volet fait partie.
 */
class PromotionController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'clients.manage');

        $query = Promotion::where('pressing_id', $request->user()->pressing_id)
            ->with('agencies:id,name')
            ->withCount('usages')
            ->latest('created_at');

        if ($request->filled('agency_id')) {
            $agencyId = $request->integer('agency_id');
            $query->where(fn ($q) => $q->whereDoesntHave('agencies')->orWhereHas('agencies', fn ($a) => $a->where('agencies.id', $agencyId)));
        }

        $promotions = $query->get();

        if ($request->filled('status')) {
            $promotions = $promotions->where('status', $request->string('status')->toString())->values();
        }

        $page = $request->integer('page', 1);
        $perPage = $request->integer('per_page', 10);
        $paginated = new LengthAwarePaginator(
            $promotions->forPage($page, $perPage)->values(),
            $promotions->count(),
            $perPage,
            $page
        );

        return response()->json($paginated);
    }

    public function store(StorePromotionRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyIds = $data['agency_ids'] ?? [];
        unset($data['agency_ids']);

        $promotion = Promotion::create([...$data, 'pressing_id' => $request->user()->pressing_id]);
        if ($agencyIds !== []) {
            $promotion->agencies()->sync($agencyIds);
        }

        return response()->json($promotion->load('agencies:id,name'), 201);
    }

    public function update(UpdatePromotionRequest $request, Promotion $promotion): JsonResponse
    {
        if ($promotion->pressing_id !== $request->user()->pressing_id) {
            throw new HttpException(403, "Vous n'avez pas accès à cette promotion.");
        }

        $data = $request->validated();
        if (array_key_exists('agency_ids', $data)) {
            $promotion->agencies()->sync($data['agency_ids'] ?? []);
            unset($data['agency_ids']);
        }
        $promotion->update($data);

        return response()->json($promotion->fresh()->load('agencies:id,name'));
    }
}
