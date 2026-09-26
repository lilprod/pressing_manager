<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Subscription\RenewCustomerSubscriptionRequest;
use App\Http\Requests\Subscription\StoreCustomerSubscriptionRequest;
use App\Models\Client;
use App\Models\CustomerSubscription;
use App\Models\SubscriptionPlan;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerSubscriptionController extends ApiController
{
    public function __construct(private readonly SubscriptionService $subscriptions) {}

    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());

        $subscriptions = CustomerSubscription::query()
            ->with('plan', 'client')
            ->when($agencyId, fn ($query) => $query->where('agency_id', $agencyId))
            ->when($request->filled('client_id'), fn ($query) => $query->where('client_id', $request->integer('client_id')))
            ->latest()
            ->get();

        return response()->json($subscriptions);
    }

    public function store(StoreCustomerSubscriptionRequest $request): JsonResponse
    {
        $data = $request->validated();
        $client = Client::findOrFail($data['client_id']);
        $this->authorizeAgency($request->user(), $client->agency_id);

        $plan = SubscriptionPlan::findOrFail($data['subscription_plan_id']);
        if ($plan->agency_id !== null && $plan->agency_id !== $client->agency_id) {
            throw new HttpException(422, "Ce plan n'est pas disponible pour l'agence du client.");
        }

        $subscription = $this->subscriptions->subscribe(
            $client,
            $plan,
            $client->agency_id,
            $data['method'],
            $data['external_reference'] ?? null,
        );

        return response()->json($subscription->load('plan', 'payments'), 201);
    }

    public function show(Request $request, CustomerSubscription $customerSubscription): JsonResponse
    {
        $this->authorizeAgency($request->user(), $customerSubscription->agency_id);

        return response()->json($customerSubscription->load('plan', 'client', 'payments'));
    }

    public function renew(RenewCustomerSubscriptionRequest $request, CustomerSubscription $customerSubscription): JsonResponse
    {
        $this->authorizeAgency($request->user(), $customerSubscription->agency_id);

        $data = $request->validated();
        $this->subscriptions->renew($customerSubscription, $data['method'], $data['external_reference'] ?? null);

        return response()->json($customerSubscription->fresh(['plan', 'payments']));
    }
}
