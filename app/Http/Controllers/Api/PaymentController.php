<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Payment\InitiateRemotePaymentRequest;
use App\Http\Requests\Payment\StoreCashPaymentRequest;
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

    public function show(Request $request, Payment $payment): JsonResponse
    {
        $this->authorizeAgency($request->user(), $payment->agency_id);

        return response()->json($payment);
    }
}
