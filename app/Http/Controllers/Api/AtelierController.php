<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Atelier\UpdateOrderPriorityRequest;
use App\Http\Requests\Atelier\UpdateOrderResponsablesRequest;
use App\Models\Agency;
use App\Models\Order;
use App\Models\User;
use App\Services\AtelierBoardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AtelierController extends ApiController
{
    public function __construct(private readonly AtelierBoardService $board) {}

    /**
     * Personnel actif de l'agence, pour le sélecteur Laveur/Classeur du panneau de
     * dépôt. Isolé de la liste légère de UserController::index() : celle-ci est aussi
     * accessible via `orders.update_status` au rôle livreur, qui ne doit PAS pouvoir
     * lister le personnel (voir DeliveryTest::test_listing_livreurs_requires...).
     */
    public function staff(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'orders.update_status');

        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        if ($agencyId === null) {
            throw new HttpException(422, "Sélectionnez une agence.");
        }

        $staff = User::query()
            ->select('id', 'name')
            ->where('agency_id', $agencyId)
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return response()->json($staff);
    }

    /** Tableau Kanban de l'atelier (section 04 Figma) : une seule agence à la fois. */
    public function board(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'orders.update_status');

        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        if ($agencyId === null) {
            throw new HttpException(422, "Sélectionnez une agence pour afficher le tableau de l'atelier.");
        }

        $agency = Agency::findOrFail($agencyId);

        // Capacité calculée sur l'ensemble des dépôts actifs de l'agence, indépendamment
        // des filtres ci-dessous (sinon la barre de capacité varierait avec la recherche).
        $activeCount = Order::where('agency_id', $agencyId)
            ->whereIn('status', AtelierBoardService::ACTIVE_STATUSES)
            ->count();

        $orders = Order::query()
            ->where('agency_id', $agencyId)
            ->whereIn('status', AtelierBoardService::ACTIVE_STATUSES)
            ->with([
                // Pas de select() restreint sur client : l'accesseur $appends
                // loyaltyDiscountRate() lit loyalty_points à chaque sérialisation, quelle
                // que soit la colonne demandée ici (piège déjà documenté dans CLAUDE.md).
                'client',
                'items:id,order_id,service_id,quantity,weight_kg,status',
                'items.service:id,name,category',
                'items.statusHistories:id,order_item_id,changed_at',
                'washer:id,name',
                'sorter:id,name',
            ])
            ->when($request->filled('priority'), fn ($query) => $query->where('priority', $request->string('priority')->value()))
            ->when($request->filled('responsible_id'), function ($query) use ($request) {
                $id = $request->integer('responsible_id');
                $query->where(fn ($q) => $q->where('washer_id', $id)->orWhere('sorter_id', $id));
            })
            ->when($request->filled('q'), function ($query) use ($request) {
                $term = $request->string('q')->value();
                $query->where(
                    fn ($q) => $q->where('order_number', 'like', "%{$term}%")
                        ->orWhereHas('client', fn ($c) => $c->where('first_name', 'ilike', "%{$term}%")
                            ->orWhere('last_name', 'ilike', "%{$term}%")
                            ->orWhere('phone', 'ilike', "%{$term}%"))
                );
            })
            ->orderBy('promised_at')
            ->get();

        $orders->each(function (Order $order) {
            $order->setAttribute('column', AtelierBoardService::columnFor($order->status));

            $lastChange = $order->items->flatMap->statusHistories->max('changed_at');
            $order->setAttribute('last_change_at', $lastChange ?? $order->created_at);

            $order->setAttribute(
                'is_late',
                $order->promised_at !== null && $order->promised_at->isPast() && ! in_array($order->status, ['pret', 'livre', 'annule'], true)
            );

            $hasWeight = $order->items->contains(fn ($item) => $item->weight_kg !== null);
            $order->setAttribute('items_summary', $hasWeight
                ? ['unit' => 'kg', 'value' => round((float) $order->items->sum('weight_kg'), 1)]
                : ['unit' => 'articles', 'value' => (int) $order->items->sum('quantity')]);
        });

        return response()->json([
            'capacity' => $agency->workshop_capacity ?? config('atelier.default_capacity'),
            'active_count' => $activeCount,
            'orders' => $orders->values(),
        ]);
    }

    /** Fait progresser un dépôt jusqu'à la colonne suivante du tableau. */
    public function advance(Request $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);
        $this->authorizePermission($request->user(), 'orders.update_status');

        if (AtelierBoardService::nextColumnFor($order->status) === null) {
            throw new HttpException(422, 'Ce dépôt est déjà à la dernière étape du tableau.');
        }

        $order = $this->board->advance($order, $request->user());

        return response()->json($order->load('items'));
    }

    public function updatePriority(UpdateOrderPriorityRequest $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        $order->update($request->validated());

        return response()->json($order);
    }

    public function updateResponsables(UpdateOrderResponsablesRequest $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);
        $data = $request->validated();

        foreach (['washer_id', 'sorter_id'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $user = User::findOrFail($data[$field]);
                if ($user->agency_id !== null && $user->agency_id !== $order->agency_id) {
                    throw new HttpException(422, "Ce membre du personnel n'appartient pas à l'agence du dépôt.");
                }
            }
        }

        $order->update($data);

        return response()->json($order->load('washer:id,name', 'sorter:id,name'));
    }
}
