<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Payment\InitiateRemotePaymentRequest;
use App\Http\Requests\Payment\StoreCashPaymentRequest;
use App\Http\Requests\Payment\StoreManualPaymentRequest;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends ApiController
{
    public function __construct(private readonly PaymentService $payments) {}

    public function storeCash(StoreCashPaymentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $data['agency_id']);

        $payment = $this->payments->recordCashPayment($data, $request->user());

        return response()->json($payment, 201);
    }

    public function initiateRemote(InitiateRemotePaymentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $data['agency_id']);

        $payment = $this->payments->initiateRemotePayment($data);

        return response()->json($payment, 201);
    }

    /**
     * V1, en attendant un agrégateur réel (voir initiateRemote() ci-dessus, qui
     * reste le chemin cible) : carte/Flooz/T-Money confirmés manuellement par le
     * caissier, exactement comme storeCash() mais avec une référence de
     * transaction obligatoire — voir PaymentService::recordManualPayment().
     */
    public function storeManual(StoreManualPaymentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['agency_id'] = $request->user()->agency_id ?? $data['agency_id'];
        $this->authorizeAgency($request->user(), $data['agency_id']);

        $payment = $this->payments->recordManualPayment([
            'agency_id' => $data['agency_id'],
            'client_id' => $data['client_id'],
            'invoice_id' => $data['invoice_id'] ?? null,
            'amount' => $data['amount'],
            'method' => $data['method'],
            'external_reference' => $data['reference'],
        ], $request->user());

        return response()->json($payment, 201);
    }

    public function show(Request $request, Payment $payment): JsonResponse
    {
        $this->authorizeAgency($request->user(), $payment->agency_id);

        return response()->json($payment);
    }
}
