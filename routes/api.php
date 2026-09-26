<?php

use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CustomerSubscriptionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\OrderItemController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SubscriptionPlanController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

// Callbacks des opérateurs de paiement : pas d'authentification Sanctum (voir secret partagé dans le contrôleur).
Route::post('/webhooks/payments/{method}', [PaymentWebhookController::class, 'handle']);

Route::middleware(['auth:sanctum', 'license'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/agencies', [AgencyController::class, 'index']);

    Route::get('/license', [LicenseController::class, 'show']);
    Route::get('/license/history', [LicenseController::class, 'history']);
    Route::get('/license/plans', [LicenseController::class, 'plans']);
    Route::post('/license/renew', [LicenseController::class, 'renew']);

    Route::apiResource('clients', ClientController::class)->except(['destroy'])->parameters(['clients' => 'client']);
    Route::delete('/clients/{client}', [ClientController::class, 'destroy']);

    Route::get('/services', [ServiceController::class, 'index']);

    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::post('/orders/{order}/invoice', [InvoiceController::class, 'storeForOrder']);

    Route::patch('/order-items/{orderItem}/status', [OrderItemController::class, 'updateStatus']);
    Route::get('/order-items/{orderItem}/qr-code', [OrderItemController::class, 'qrImage']);
    Route::get('/order-items/scan/{qrCode}', [OrderItemController::class, 'showByQrCode']);

    Route::get('/invoices/{invoice}', [InvoiceController::class, 'show']);
    Route::get('/invoices/{invoice}/pdf', [InvoiceController::class, 'downloadPdf']);

    Route::post('/payments/cash', [PaymentController::class, 'storeCash']);
    Route::post('/payments/remote', [PaymentController::class, 'initiateRemote']);
    Route::get('/payments/{payment}', [PaymentController::class, 'show']);

    Route::get('/subscription-plans', [SubscriptionPlanController::class, 'index']);
    Route::post('/subscription-plans', [SubscriptionPlanController::class, 'store']);

    Route::get('/customer-subscriptions', [CustomerSubscriptionController::class, 'index']);
    Route::post('/customer-subscriptions', [CustomerSubscriptionController::class, 'store']);
    Route::get('/customer-subscriptions/{customerSubscription}', [CustomerSubscriptionController::class, 'show']);
    Route::post('/customer-subscriptions/{customerSubscription}/renew', [CustomerSubscriptionController::class, 'renew']);
});
