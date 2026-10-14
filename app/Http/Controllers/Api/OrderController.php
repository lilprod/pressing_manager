<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Order\CancelOrderRequest;
use App\Http\Requests\Order\StoreOrderRequest;
use App\Http\Requests\Order\UpdateOrderRequest;
use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\CustomerSubscription;
use App\Models\OrderSyncLog;
use App\Models\Payment;
use App\Models\TreatmentType;
use App\Services\InvoiceService;
use App\Services\OrderNumberGenerator;
use App\Services\OrdersExcelExporter;
use App\Services\PaymentService;
use App\Services\QrCodeGenerator;
use App\Services\ServicePricingService;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderController extends ApiController
{
    public function __construct(
        private readonly OrderNumberGenerator $orderNumbers,
        private readonly QrCodeGenerator $qrCodes,
        private readonly SubscriptionService $subscriptions,
        private readonly ServicePricingService $pricing,
        private readonly OrdersExcelExporter $exporter,
        private readonly InvoiceService $invoices,
        private readonly PaymentService $payments,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $orders = $this->filteredOrdersQuery($request)
            ->latest()
            ->paginate($request->integer('per_page', 20));

        $orders->getCollection()->transform(fn (Order $order) => $this->decorateForList($order));

        return response()->json($orders);
    }

    /** Export Excel de la liste des dépôts — mêmes filtres que index(), jamais paginé. */
    public function export(Request $request): StreamedResponse
    {
        $orders = $this->filteredOrdersQuery($request)->latest()->get()
            ->map(fn (Order $order) => $this->decorateForList($order));

        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $agencyLabel = count($agencyId) === 1 ? (Agency::find($agencyId[0])?->name ?? '—') : 'Toutes agences';

        return $this->exporter->download($orders, $agencyLabel);
    }

    /** Filtres communs à index() et export() — jamais divergents entre les deux. */
    private function filteredOrdersQuery(Request $request)
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $search = trim((string) $request->string('search'));

        return Order::query()
            ->with('client', 'agency.settings', 'items.treatmentType', 'invoice.payments')
            ->whereIn('agency_id', $agencyId)
            // État atelier (pipeline de production), distinct du statut commercial ci-dessous.
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')->value()))
            // Statut commercial (facturation) : "non_facture" = aucune facture émise pour ce dépôt.
            ->when($request->filled('invoice_status'), function ($query) use ($request) {
                $invoiceStatus = $request->string('invoice_status')->value();
                if ($invoiceStatus === 'non_facture') {
                    $query->doesntHave('invoice');
                } else {
                    $query->whereHas('invoice', fn ($q) => $q->where('status', $invoiceStatus));
                }
            })
            ->when($request->filled('client_id'), fn ($query) => $query->where('client_id', $request->integer('client_id')))
            ->when($request->boolean('ready_today'), fn ($query) => $query->whereDate('promised_at', now()->toDateString()))
            // Période du dépôt (created_at) : "today"/"week"/"month" — absent ou "all" = aucune borne.
            ->when($request->filled('period'), function ($query) use ($request) {
                $period = $request->string('period')->value();
                match ($period) {
                    'today' => $query->whereDate('created_at', now()->toDateString()),
                    'week' => $query->where('created_at', '>=', now()->startOfWeek()),
                    'month' => $query->where('created_at', '>=', now()->startOfMonth()),
                    default => null,
                };
            })
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($q) use ($search) {
                    if (ctype_digit($search)) {
                        $q->orWhere('order_number', (int) $search);
                    }
                    $q->orWhereHas('client', function ($clientQuery) use ($search) {
                        $clientQuery->where('first_name', 'ilike', "%{$search}%")
                            ->orWhere('last_name', 'ilike', "%{$search}%")
                            ->orWhere('phone', 'ilike', "%{$search}%");
                    });
                });
            });
    }

    /**
     * Agrégats calculés par dépôt pour la liste (jamais fabriqués) : solde (même
     * formule que balanceDue() ci-dessous), prestation dominante (nom du traitement
     * si uniforme sur toutes les lignes, sinon absente plutôt que devinée), et
     * volume (pièces et/ou poids selon le mode de facturation réel des lignes).
     */
    private function decorateForList(Order $order): Order
    {
        $invoice = $order->invoice->first();
        $paidAmount = $invoice ? (int) $invoice->payments->where('status', 'complete')->sum('amount') : 0;
        $order->setAttribute('paid_amount', $invoice ? $paidAmount : null);
        $order->setAttribute('balance_due', $invoice ? max(0, $invoice->total_amount - $paidAmount) : null);
        // Code dépôt affiché (préfixe/suffixe d'agence) — `agency.settings` est chargé avec
        // la liste, donc aucun N+1 ; la colonne brute `order_number` reste intacte.
        $order->setAttribute('order_number_formatted', $order->agency?->formatOrderNumber((int) $order->order_number));
        $order->unsetRelation('agency');

        $treatmentNames = $order->items->pluck('treatmentType.name')->filter()->unique();
        $order->setAttribute('treatment_name', $treatmentNames->count() === 1 ? $treatmentNames->first() : null);

        $pieces = (int) $order->items->whereNull('weight_kg')->sum('quantity');
        $weightKg = (float) $order->items->whereNotNull('weight_kg')->sum('weight_kg');
        $order->setAttribute('pieces_count', $pieces > 0 ? $pieces : null);
        $order->setAttribute('weight_kg_total', $weightKg > 0 ? $weightKg : null);

        return $order;
    }

    /** KPI de la liste des dépôts, calculés uniquement à partir de données réelles. */
    public function stats(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyFilter($request, $request->user());
        $today = now()->toDateString();

        $todayCount = Order::query()
            ->whereIn('agency_id', $agencyId)
            ->whereDate('created_at', $today)
            ->count();

        $todayRevenue = (int) Payment::query()
            ->where('status', 'complete')
            ->whereIn('agency_id', $agencyId)
            ->whereDate('paid_at', $today)
            ->sum('amount');

        $dueToday = Order::query()
            ->whereIn('agency_id', $agencyId)
            ->whereDate('promised_at', $today)
            ->whereNotIn('status', ['livre', 'annule'])
            ->count();

        $outstandingBalance = (int) Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->whereIn('agency_id', $agencyId)
            ->withSum(['payments as paid_amount' => fn ($query) => $query->where('status', 'complete')], 'amount')
            ->get()
            ->sum(fn (Invoice $invoice) => max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0)));

        // Sous-libellés des cartes (capture « Gestion des dépôts ») — tous réels :
        // même jour de la semaine précédente, montant déposé du jour (hors annulés),
        // dépôts dus aujourd'hui déjà prêts, nombre de factures encore ouvertes.
        $sameDayLastWeek = now()->subWeek()->toDateString();
        $lastWeekCount = Order::query()
            ->whereIn('agency_id', $agencyId)
            ->whereDate('created_at', $sameDayLastWeek)
            ->count();

        $todayDeposited = (int) Order::query()
            ->whereIn('agency_id', $agencyId)
            ->whereDate('created_at', $today)
            ->where('status', '!=', 'annule')
            ->sum('total_amount');

        $readyDueToday = Order::query()
            ->whereIn('agency_id', $agencyId)
            ->whereDate('promised_at', $today)
            ->where('status', 'pret')
            ->count();

        $openInvoices = Invoice::query()
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->whereIn('agency_id', $agencyId)
            ->count();

        return response()->json([
            'today_count' => $todayCount,
            'today_revenue' => $todayRevenue,
            'due_today' => $dueToday,
            'outstanding_balance' => $outstandingBalance,
            'same_day_last_week_count' => $lastWeekCount,
            'today_deposited_amount' => $todayDeposited,
            'ready_due_today' => $readyDueToday,
            'open_invoices_count' => $openInvoices,
        ]);
    }

    #[OA\Post(
        path: '/orders',
        summary: "Crée un dépôt multi-articles (idempotent via client_local_uuid pour la réconciliation hors-ligne)",
        tags: ['Dépôts'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 201, description: 'Dépôt créé'),
            new OA\Response(response: 200, description: 'Dépôt déjà synchronisé (rejouée par client_local_uuid)'),
            new OA\Response(response: 422, description: 'Client hors de l\'agence ou données invalides'),
        ]
    )]
    public function store(StoreOrderRequest $request): JsonResponse
    {
        $data = $request->validated();
        $agencyId = $request->user()->effectiveAgencyId($data['agency_id'] ?? null);
        $this->authorizeAgency($request->user(), $agencyId);

        // Encaissement intégré à la création (refonte flux comptoir) : un rôle personnalisé
        // peut avoir orders.manage sans les permissions de facturation/encaissement — ne
        // jamais supposer silencieusement qu'il les détient (accueil/manager/admin les ont
        // tous les trois par défaut, mais un rôle custom peut diverger).
        if (! empty($data['payment_method'])) {
            $this->authorizePermission($request->user(), 'invoices.manage');
            $this->authorizePermission($request->user(), 'payments.manage');
        }

        // Idempotence : une commande créée hors-ligne déjà synchronisée n'est jamais dupliquée.
        if (! empty($data['client_local_uuid'])) {
            $existing = Order::where('client_local_uuid', $data['client_local_uuid'])->first();
            if ($existing !== null) {
                return response()->json($existing->load(['items.intakeConditions', 'invoice.payments']), 200);
            }
        }

        $client = Client::findOrFail($data['client_id']);
        if ($client->agency_id !== $agencyId) {
            throw new HttpException(422, "Le client n'appartient pas à cette agence.");
        }

        $agency = Agency::findOrFail($agencyId);
        $agencySettings = AgencySetting::forAgency($agencyId);

        // Un dépôt est express si le comptoir l'a coché OU si au moins une ligne est
        // facturée au traitement « Express » : le tarif express de l'article implique
        // le délai et la priorité express, jamais l'un sans l'autre.
        $expressTreatmentIds = collect($data['items'])->pluck('treatment_type_id')->filter()->unique()->all();
        $data['is_express'] = (bool) ($data['is_express'] ?? false)
            || ($expressTreatmentIds !== [] && TreatmentType::where('pressing_id', $agency->pressing_id)
                ->whereIn('id', $expressTreatmentIds)->where('code', 'express')->exists());

        $order = DB::transaction(function () use ($data, $agencyId, $agency, $agencySettings, $request) {
            $order = Order::create([
                'agency_id' => $agencyId,
                'client_id' => $data['client_id'],
                'created_by' => $request->user()->id,
                'order_number' => $this->orderNumbers->next($agencyId),
                'client_local_uuid' => $data['client_local_uuid'] ?? null,
                'status' => 'recu',
                'is_express' => $data['is_express'] ?? false,
                // Priorité Kanban atelier par défaut : les dépôts express sont urgents à
                // la création, les autres démarrent normale. Ajustable ensuite par l'atelier
                // (client VIP, retard imminent) via AtelierController::updatePriority().
                'priority' => ($data['is_express'] ?? false) ? 'urgent' : 'normale',
                'source' => ! empty($data['client_local_uuid']) ? 'offline_sync' : 'comptoir',
                'sync_status' => 'synced',
                'promised_at' => $data['promised_at'] ?? null,
                // Remise finale (dont la répartition fidélité/promotion) déterminée plus
                // bas, une fois `$total` connu — un code promo peut dépendre du montant du
                // dépôt (`minimum_order_amount`), pas calculable avant d'avoir parcouru les
                // lignes. Voir migration `add_discount_breakdown_to_orders_table`.
                'discount_amount' => 0,
                'notes' => $data['notes'] ?? null,
            ]);

            $total = 0;
            $maxDurationHours = 0;
            foreach ($data['items'] as $itemData) {
                $service = $agency->services()->with('treatmentRates')->findOrFail($itemData['service_id']);

                $treatmentType = null;
                if (! empty($itemData['treatment_type_id'])) {
                    $treatmentType = TreatmentType::where('pressing_id', $agency->pressing_id)->findOrFail($itemData['treatment_type_id']);
                    if (! $treatmentType->is_active) {
                        throw new HttpException(422, "Le traitement « {$treatmentType->name} » n'est plus disponible.");
                    }
                }

                // Délai par traitement défini sur la fiche article (Classique 72 h,
                // Express 24 h…), sinon délai général de l'article.
                $maxDurationHours = max($maxDurationHours, $this->pricing->delayFor($service, $treatmentType));

                $weightKg = $itemData['weight_kg'] ?? null;
                if ($weightKg !== null && ! in_array($service->billing_mode, ['kg', 'mixte'], true)) {
                    throw new HttpException(422, "« {$service->name} » n'est pas facturable au kilo.");
                }

                // Prix unique de vérité (ServicePricingService::priceFor) : prix explicite
                // du traitement sur l'article, sinon ratio du traitement (CDC §11.1-11.3),
                // prix local d'agence appliqué proportionnellement.
                $unitPrice = $this->pricing->priceFor($service, $treatmentType, $service->pivot->price_override, $weightKg !== null ? (float) $weightKg : null);
                if ($unitPrice === null) {
                    throw new HttpException(422, "Aucune grille de prix ne couvre {$weightKg} kg pour « {$service->name} ».");
                }
                // Un dépôt au kilo est traité comme un seul lot (quantity = 1) : le
                // retrait partiel par quantité n'a pas de sens pour un poids global.
                $quantity = $weightKg !== null ? 1 : $itemData['quantity'];

                // Rendu (sur cintre, plié…) : seulement parmi les rendus compatibles de l'article.
                $finishOptionId = $itemData['finish_option_id'] ?? null;
                if ($finishOptionId !== null && ! $service->finishOptions()->where('finish_options.id', $finishOptionId)->where('finish_options.is_active', true)->exists()) {
                    throw new HttpException(422, "Ce rendu n'est pas compatible avec « {$service->name} ».");
                }

                $item = $order->items()->create([
                    'agency_id' => $agencyId,
                    'service_id' => $service->id,
                    'treatment_type_id' => $treatmentType?->id,
                    'finish_option_id' => $finishOptionId,
                    'qr_code' => $this->qrCodes->generateCode($agency->code),
                    'description' => $itemData['description'] ?? null,
                    'intake_notes' => $itemData['intake_notes'] ?? null,
                    'quantity' => $quantity,
                    'weight_kg' => $weightKg,
                    'unit_price' => $unitPrice,
                    'status' => 'recu',
                ]);

                if (! empty($itemData['intake_condition_ids'])) {
                    $accepted = $service->acceptedConditions()->pluck('intake_conditions.id')->all();
                    $refused = $accepted === [] ? [] : array_diff($itemData['intake_condition_ids'], $accepted);
                    if ($refused !== []) {
                        throw new HttpException(422, "Un état signalé n'est pas accepté pour « {$service->name} ».");
                    }
                    $item->intakeConditions()->sync($itemData['intake_condition_ids']);
                }

                $total += $unitPrice * $quantity;
            }

            // Montant minimum configurable (« Paramètres opérationnels ») : plancher
            // honnête, rejette avant toute facturation plutôt qu'après coup.
            if ($agencySettings->minimum_order_amount !== null && $total < $agencySettings->minimum_order_amount) {
                throw new HttpException(422, "Le montant du dépôt ({$total} FCFA) est sous le minimum configuré ({$agencySettings->minimum_order_amount} FCFA).");
            }

            // Audit « Promotions et fidélité » (CLAUDE.md) : répartition honnête de la
            // remise — part fidélité (auto-calculée, non modifiée par le caissier) +
            // part promotion (code validé serveur, jamais recalculé côté client) + un
            // éventuel reliquat manuel. `discount_amount` reste le total facturé, inchangé
            // pour InvoiceService ; les deux nouvelles colonnes rendent l'origine
            // interrogeable (KPI « Remises accordées », reporting promotions).
            $loyaltyDiscountAmount = ($data['discount_is_loyalty_auto'] ?? false) ? (int) ($data['discount_amount'] ?? 0) : 0;
            $manualDiscountAmount = ($data['discount_is_loyalty_auto'] ?? false) ? 0 : (int) ($data['discount_amount'] ?? 0);
            $promotion = null;
            $promotionDiscountAmount = 0;

            if (! empty($data['promotion_code'])) {
                $promotion = \App\Models\Promotion::where('pressing_id', $agency->pressing_id)
                    ->whereRaw('UPPER(code) = ?', [strtoupper(trim($data['promotion_code']))])
                    ->lockForUpdate()
                    ->first();

                if ($promotion === null || ! $promotion->is_active) {
                    throw new HttpException(422, "Code promotionnel invalide.");
                }
                $today = now()->startOfDay();
                if ($today->lt($promotion->starts_at) || $today->gt($promotion->ends_at)) {
                    throw new HttpException(422, "Ce code promotionnel n'est pas actif sur la période en cours.");
                }
                if (! $promotion->isEligibleForAgency($agencyId)) {
                    throw new HttpException(422, "Ce code promotionnel n'est pas valide pour cette agence.");
                }
                if ($promotion->minimum_order_amount !== null && $total < $promotion->minimum_order_amount) {
                    throw new HttpException(422, "Ce code promotionnel requiert un dépôt d'au moins {$promotion->minimum_order_amount} FCFA.");
                }
                if ($promotion->quota_total !== null && $promotion->usages()->count() >= $promotion->quota_total) {
                    throw new HttpException(422, "Ce code promotionnel a atteint son quota d'utilisation.");
                }
                if ($promotion->quota_per_client !== null && $promotion->usages()->where('client_id', $data['client_id'])->count() >= $promotion->quota_per_client) {
                    throw new HttpException(422, "Ce client a déjà utilisé ce code promotionnel.");
                }

                $promotionDiscountAmount = $promotion->discount_type === 'percentage'
                    ? (int) round($total * $promotion->discount_value / 100)
                    : $promotion->discount_value;
                if ($promotion->max_discount_amount !== null) {
                    $promotionDiscountAmount = min($promotionDiscountAmount, $promotion->max_discount_amount);
                }
                $promotionDiscountAmount = min($promotionDiscountAmount, $total);

                // Une promotion non cumulable écrase la remise fidélité auto-calculée sur
                // ce dépôt (règle métier tranchée pour cet audit, absente de la maquette) —
                // jamais les deux à la fois sans l'accord explicite de la campagne.
                if (! $promotion->combinable_with_loyalty) {
                    $loyaltyDiscountAmount = 0;
                }
            }

            $order->loyalty_discount_amount = $loyaltyDiscountAmount;
            $order->promotion_id = $promotion?->id;
            $order->promotion_discount_amount = $promotionDiscountAmount;
            $order->discount_amount = min($total, $loyaltyDiscountAmount + $promotionDiscountAmount + $manualDiscountAmount);

            $order->total_amount = $total;
            if ($order->promised_at === null) {
                // Délai configuré par agence (classique/express) comme PLANCHER, pas un
                // remplacement : ne raccourcit jamais une promesse déjà plus longue
                // dérivée du catalogue (Service::estimated_duration_hours).
                $isExpress = $data['is_express'] ?? false;
                // Dépôt uniquement en « repassage » (traitement de finition) : délai de finition.
                $finishingOnly = ! $isExpress && $order->items()->exists()
                    && $order->items()->whereHas('treatmentType', fn ($q) => $q->whereIn('code', ['repassage', 'repassage_seul']))->count() === $order->items()->count();
                $configuredDelay = $isExpress
                    ? $agencySettings->express_delay_hours
                    : ($finishingOnly && $agencySettings->finishing_delay_hours ? $agencySettings->finishing_delay_hours : $agencySettings->standard_delay_hours);
                $maxDurationHours = max($maxDurationHours, $configuredDelay ?? 0);
                $order->promised_at = now()->addHours($maxDurationHours);
            }
            $order->save();

            if ($promotion !== null) {
                \App\Models\PromotionUsage::create([
                    'promotion_id' => $promotion->id,
                    'client_id' => $data['client_id'],
                    'order_id' => $order->id,
                    'agency_id' => $agencyId,
                    'discount_amount' => $promotionDiscountAmount,
                    'used_at' => now(),
                ]);
            }

            // Paiement intégré à la création (refonte flux comptoir, 2026-10-05) : la
            // facture n'est générée que si un paiement est réellement soumis — un dépôt
            // créé sans aucun champ de paiement reste exactement comme avant cette passe
            // (aucune facture, encaissement différé via InvoicePanel/Retrait).
            if (! empty($data['payment_method'])) {
                $invoice = $this->invoices->createFromOrder($order);
                // Jamais un paiement enregistré plus grand que la facture, même si le
                // frontend calcule mal la monnaie à rendre (concept purement client, non
                // persisté) : le serveur reste seul garant du montant réellement appliqué.
                $appliedAmount = min((int) $data['payment_amount'], $invoice->total_amount);
                $paymentData = [
                    'agency_id' => $agencyId,
                    'client_id' => $data['client_id'],
                    'invoice_id' => $invoice->id,
                    'amount' => $appliedAmount,
                ];
                if ($data['payment_method'] === 'espece') {
                    $this->payments->recordCashPayment($paymentData, $request->user());
                } else {
                    $paymentData['method'] = $data['payment_method'];
                    $paymentData['external_reference'] = $data['payment_reference'];
                    $this->payments->recordManualPayment($paymentData, $request->user());
                }
            }

            $activeSubscription = CustomerSubscription::where('client_id', $data['client_id'])
                ->where('agency_id', $agencyId)
                ->where('status', 'active')
                ->where('expires_at', '>', now())
                ->first();

            if ($activeSubscription !== null) {
                $itemsCount = array_sum(array_column($data['items'], 'quantity'));
                $this->subscriptions->consumeQuota($activeSubscription, $itemsCount);
            }

            if (! empty($data['client_local_uuid'])) {
                OrderSyncLog::create([
                    'order_id' => $order->id,
                    'client_local_uuid' => $data['client_local_uuid'],
                    'conflict_type' => 'aucun',
                    'synced_at' => now(),
                ]);
            }

            return $order;
        });

        // Notification « Dépôt enregistré » après validation de la transaction.
        app(\App\Services\NotificationService::class)->notifyEvent($order->agency_id, 'order_received', $order->client, ['order' => $order]);

        return response()->json($order->load(['items.intakeConditions', 'invoice.payments']), 201);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        $order->load(
            'items.service', 'items.treatmentType', 'items.finishOption:id,name', 'items.intakeConditions', 'items.statusHistories.actor',
            'client', 'invoice.payments.receiver', 'agency', 'pickups.items.orderItem', 'pickups.processor', 'creator',
            'washer', 'sorter', 'promotion:id,code,name',
        );
        $balanceDue = $this->balanceDue($order);
        $order->setAttribute('balance_due', $balanceDue);
        // Codes dépôt (« Paramètres opérationnels ») : couche d'affichage uniquement,
        // appliquée ici (fiche dépôt + ticket imprimé) — pas sur les listes paginées,
        // pour éviter un N+1 sur AgencySetting à chaque ligne (voir CLAUDE.md).
        $order->setAttribute('order_number_formatted', $order->agency->formatOrderNumber($order->order_number));

        // Carte « Client » de la fiche dépôt : solde dû sur les AUTRES dépôts du
        // client (la carte « Reste à payer » couvre déjà celui-ci) — même formule
        // que ClientController::show(), jamais une estimation séparée.
        $clientTotalBalanceDue = (int) Invoice::where('client_id', $order->client_id)
            ->whereIn('status', ['emise', 'partiellement_payee'])
            ->withSum(['payments as paid_amount' => fn ($query) => $query->where('status', 'complete')], 'amount')
            ->get()
            ->sum(fn (Invoice $invoice) => max(0, $invoice->total_amount - (int) ($invoice->paid_amount ?? 0)));
        $order->client->setAttribute('other_balance_due', max(0, $clientTotalBalanceDue - $balanceDue));

        return response()->json($order);
    }

    /**
     * « Modifier le dépôt » (fiche dépôt) — volontairement limité aux champs sans
     * impact tarifaire. Les articles/prix/remise restent figés une fois le dépôt
     * créé (même garantie que pour une facture déjà émise : rouvrir le calcul du
     * total exigerait de rejouer toute la logique de tarification/paliers/
     * traitements de store(), hors scope de cette passe). Bloqué une fois le
     * dépôt livré ou annulé — plus rien à modifier à ce stade.
     */
    public function update(UpdateOrderRequest $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        if (in_array($order->status, ['livre', 'annule'], true)) {
            throw new HttpException(422, "Ce dépôt est {$order->status} : il n'est plus modifiable.");
        }

        $order->fill($request->validated());
        $order->save();

        return $this->show($request, $order);
    }

    /**
     * « Annuler le dépôt » (fiche dépôt) — statut terminal jamais utilisé jusqu'ici
     * (confirmé par lecture de code, aucune autre route ne positionne 'annule').
     * Bloqué si déjà livré/annulé, ou si un paiement a déjà été encaissé (un
     * remboursement est un flux distinct, non construit). La facture associée,
     * si elle existe et n'a reçu aucun paiement, est annulée avec le dépôt pour
     * rester cohérente plutôt que de laisser une facture orpheline. Le motif,
     * optionnel, est ajouté aux notes plutôt que de créer une colonne dédiée pour
     * un seul champ — la trace acteur/horodatage est de toute façon déjà assurée
     * par Auditable (Order a déjà ce trait).
     */
    public function cancel(CancelOrderRequest $request, Order $order): JsonResponse
    {
        $this->authorizeAgency($request->user(), $order->agency_id);

        if (in_array($order->status, ['livre', 'annule'], true)) {
            throw new HttpException(422, "Ce dépôt est déjà {$order->status}.");
        }

        $order->loadMissing('invoice.payments');
        $hasCompletedPayment = $order->invoice->contains(
            fn (Invoice $invoice) => $invoice->payments->contains(fn ($payment) => $payment->status === 'complete')
        );
        if ($hasCompletedPayment) {
            throw new HttpException(422, 'Un paiement a déjà été encaissé sur ce dépôt : l\'annulation directe n\'est pas possible.');
        }

        $reason = $request->validated()['reason'] ?? null;

        DB::transaction(function () use ($order, $reason) {
            $order->status = 'annule';
            if ($reason) {
                $order->notes = trim(($order->notes ? $order->notes."\n" : '')."Annulation : {$reason}");
            }
            $order->save();

            foreach ($order->invoice as $invoice) {
                $invoice->status = 'annulee';
                $invoice->save();
            }
        });

        return $this->show($request, $order);
    }

    private function balanceDue(Order $order): int
    {
        return (int) $order->invoice->sum(function ($invoice) {
            $paid = $invoice->payments->where('status', 'complete')->sum('amount');

            return max(0, $invoice->total_amount - $paid);
        });
    }
}
