<?php

use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CustomerSubscriptionController;
use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\DeliveryZoneController;
use App\Http\Controllers\Api\IntakeConditionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\KpiController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\LoyaltyTierController;
use App\Http\Controllers\Api\NotificationLogController;
use App\Http\Controllers\Api\NotificationSettingController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\OrderItemController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\PerformanceController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\StockItemController;
use App\Http\Controllers\Api\StockMovementController;
use App\Http\Controllers\Api\SubscriptionPlanController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

// Callbacks des opérateurs de paiement : pas d'authentification Sanctum (voir secret partagé dans le contrôleur).
Route::post('/webhooks/payments/{method}', [PaymentWebhookController::class, 'handle']);

// Identité du pressing (nom, adresse, logo, favicon) : publique, utilisée avant connexion
// (écran de connexion, titre de l'onglet, favicon, reçus imprimés).
Route::get('/settings', [SettingsController::class, 'show']);
Route::get('/settings/logo', [SettingsController::class, 'logo']);
Route::get('/settings/favicon', [SettingsController::class, 'favicon']);

Route::middleware(['auth:sanctum', 'license'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::post('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::get('/users/{user}/photo', [ProfileController::class, 'photo']);
    Route::get('/agencies', [AgencyController::class, 'index']);

    Route::post('/settings', [SettingsController::class, 'update']);

    Route::get('/license', [LicenseController::class, 'show']);
    Route::get('/license/history', [LicenseController::class, 'history']);
    Route::get('/license/plans', [LicenseController::class, 'plans']);
    Route::post('/license/renew', [LicenseController::class, 'renew']);

    Route::apiResource('clients', ClientController::class)->except(['destroy'])->parameters(['clients' => 'client']);
    Route::delete('/clients/{client}', [ClientController::class, 'destroy']);

    Route::get('/services', [ServiceController::class, 'index']);

    Route::get('/intake-conditions', [IntakeConditionController::class, 'index']);

    Route::get('/loyalty-tiers', [LoyaltyTierController::class, 'index']);
    Route::post('/loyalty-tiers', [LoyaltyTierController::class, 'store']);
    Route::patch('/loyalty-tiers/{loyaltyTier}', [LoyaltyTierController::class, 'update']);

    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::post('/orders/{order}/invoice', [InvoiceController::class, 'storeForOrder']);

    Route::patch('/order-items/{orderItem}/status', [OrderItemController::class, 'updateStatus']);
    Route::get('/order-items/{orderItem}/qr-code', [OrderItemController::class, 'qrImage']);
    Route::get('/order-items/scan/{qrCode}', [OrderItemController::class, 'showByQrCode']);

    Route::get('/invoices', [InvoiceController::class, 'index']);
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

    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::post('/suppliers', [SupplierController::class, 'store']);

    Route::get('/stock-items', [StockItemController::class, 'index']);
    Route::post('/stock-items', [StockItemController::class, 'store']);

    Route::get('/stock', [StockController::class, 'index']);

    Route::get('/stock-movements', [StockMovementController::class, 'index']);
    Route::post('/stock-movements', [StockMovementController::class, 'store']);

    Route::get('/delivery-zones', [DeliveryZoneController::class, 'index']);
    Route::post('/delivery-zones', [DeliveryZoneController::class, 'store']);

    Route::get('/deliveries', [DeliveryController::class, 'index']);
    Route::post('/deliveries', [DeliveryController::class, 'store']);
    Route::get('/deliveries/{delivery}', [DeliveryController::class, 'show']);
    Route::post('/deliveries/{delivery}/assign', [DeliveryController::class, 'assign']);
    Route::post('/deliveries/{delivery}/status', [DeliveryController::class, 'updateStatus']);
    Route::post('/deliveries/{delivery}/complete', [DeliveryController::class, 'complete']);
    Route::post('/deliveries/{delivery}/fail', [DeliveryController::class, 'fail']);
    Route::get('/deliveries/{delivery}/photo', [DeliveryController::class, 'photo']);
    Route::get('/deliveries/{delivery}/signature', [DeliveryController::class, 'signature']);

    Route::get('/roles', [RoleController::class, 'index']);

    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::patch('/users/{user}', [UserController::class, 'update']);
    Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);

    Route::get('/shifts', [ShiftController::class, 'index']);
    Route::post('/shifts', [ShiftController::class, 'store']);

    Route::get('/attendances', [AttendanceController::class, 'index']);
    Route::post('/attendances/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('/attendances/clock-out', [AttendanceController::class, 'clockOut']);

    Route::get('/hr/performance', [PerformanceController::class, 'index']);

    Route::get('/kpi', [KpiController::class, 'index']);
    Route::get('/kpi/export/pdf', [KpiController::class, 'exportPdf']);
    Route::get('/kpi/export/excel', [KpiController::class, 'exportExcel']);

    Route::get('/notification-settings', [NotificationSettingController::class, 'index']);
    Route::post('/notification-settings', [NotificationSettingController::class, 'store']);

    Route::get('/notification-logs', [NotificationLogController::class, 'index']);
});
