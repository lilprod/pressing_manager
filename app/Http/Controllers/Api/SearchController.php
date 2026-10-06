<?php

namespace App\Http\Controllers\Api;

use App\Models\Client;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Recherche globale (en-tête, raccourci ⌘K) : clients + dépôts, en parallèle de
 * deux requêtes scopées identiques aux listes existantes (ClientController::index()/
 * OrderController::index()) — jamais une seule requête fourre-tout. Scope
 * agence/pressing réutilise `resolveAgencyFilter()` comme partout ailleurs.
 */
class SearchController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $term = trim((string) $request->string('q'));

        if (mb_strlen($term) < 2) {
            return response()->json(['clients' => [], 'orders' => []]);
        }

        $agencyIds = $this->resolveAgencyFilter($request, $user);

        $clients = collect();
        if ($user->hasPermission('clients.manage')) {
            $clients = Client::query()
                ->whereIn('agency_id', $agencyIds)
                ->where(fn ($q) => $q->where('first_name', 'ilike', "%{$term}%")
                    ->orWhere('last_name', 'ilike', "%{$term}%")
                    ->orWhere('phone', 'ilike', "%{$term}%"))
                ->orderBy('last_name')
                ->limit(5)
                ->get()
                ->map(fn (Client $client) => [
                    'id' => $client->id,
                    'label' => trim("{$client->first_name} {$client->last_name}"),
                    'subtitle' => $client->phone,
                    'url' => "/clients/{$client->id}",
                ])
                ->values();
        }

        $orders = Order::query()
            ->with('client', 'agency')
            ->whereIn('agency_id', $agencyIds)
            ->where(function ($q) use ($term) {
                if (ctype_digit($term)) {
                    $q->orWhere('order_number', (int) $term);
                }
                $q->orWhereHas('client', function ($clientQuery) use ($term) {
                    $clientQuery->where('first_name', 'ilike', "%{$term}%")
                        ->orWhere('last_name', 'ilike', "%{$term}%")
                        ->orWhere('phone', 'ilike', "%{$term}%");
                });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'label' => $order->agency->formatOrderNumber($order->order_number),
                'subtitle' => $order->client ? trim("{$order->client->first_name} {$order->client->last_name}") : null,
                'url' => "/orders/{$order->id}",
            ])
            ->values();

        return response()->json(['clients' => $clients, 'orders' => $orders]);
    }
}
