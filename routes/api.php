<?php

use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AgencySettingController;
use App\Http\Controllers\Api\AtelierController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CustomerSubscriptionController;
use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DeliveryZoneController;
use App\Http\Controllers\Api\IntakeConditionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\KpiController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\LoyaltyTierController;
use App\Http\Controllers\Api\TreatmentTypeController;
use App\Http\Controllers\Api\MultiAgencyController;
use App\Http\Controllers\Api\NotificationLogController;
use App\Http\Controllers\Api\NotificationSettingController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PickupController;
use App\Http\Controllers\Api\OrderItemController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PerformanceController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\Platform\PlatformAuthController;
use App\Http\Controllers\Api\Platform\PlatformAuditLogController;
use App\Http\Controllers\Api\Platform\PlatformDashboardController;
use App\Http\Controllers\Api\Platform\PlatformPlanController;
use App\Http\Controllers\Api\Platform\PlatformProfileController;
use App\Http\Controllers\Api\Platform\PlatformRoleController;
use App\Http\Controllers\Api\Platform\PlatformSettingController;
use App\Http\Controllers\Api\Platform\PlatformUserController;
use App\Http\Controllers\Api\Platform\PressingController as PlatformPressingController;
use App\Http\Controllers\Api\Platform\PressingReportController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\StaffAlertController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\StockItemController;
use App\Http\Controllers\Api\StockMovementController;
use App\Http\Controllers\Api\SubscriptionPlanController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');
Route::post('/login/agencies', [AuthController::class, 'agenciesForEmail'])->middleware('throttle:20,1');
Route::post('/password/forgot', [PasswordResetController::class, 'forgot'])->middleware('throttle:6,1');
Route::post('/password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:10,1');

// Callbacks des opérateurs de paiement : pas d'authentification Sanctum (voir secret partagé dans le contrôleur).
Route::post('/webhooks/payments/{method}', [PaymentWebhookController::class, 'handle']);

// Identité du pressing (nom, adresse, logo, favicon) : publique, utilisée avant connexion
// (écran de connexion, titre de l'onglet, favicon, reçus imprimés).
Route::get('/settings', [SettingsController::class, 'show']);
Route::get('/settings/logo', [SettingsController::class, 'logo']);
Route::get('/settings/favicon', [SettingsController::class, 'favicon']);

// Identité de la console superadmin (logo/nom/couleurs), publique pour l'écran de
// connexion plateforme — même raisonnement que les routes tenant ci-dessus.
Route::get('/platform/settings/logo', [\App\Http\Controllers\Api\Platform\PlatformSettingController::class, 'logo']);
Route::get('/platform/settings/favicon', [\App\Http\Controllers\Api\Platform\PlatformSettingController::class, 'favicon']);

// Console superadmin plateforme (Spark) : royaume d'authentification séparé du tenant
// (guard `platform`, voir config/auth.php) — voir docs/ARCHITECTURE.md pour le pourquoi
// de la séparation (chaque pressing tourne sur son propre déploiement isolé).
Route::prefix('platform')->group(function () {
    Route::post('/login', [PlatformAuthController::class, 'login'])->middleware('throttle:6,1');
    Route::post('/login/verify', [PlatformAuthController::class, 'verify'])->middleware('throttle:10,1');
    Route::post('/login/setup', [PlatformAuthController::class, 'confirmSetup'])->middleware('throttle:10,1');

    // Jeton de rapport dédié, pas Sanctum — un déploiement tenant n'est pas un "utilisateur".
    Route::post('/reports', [PressingReportController::class, 'store'])->middleware('platform.report');

    Route::middleware('auth:platform')->group(function () {
        Route::post('/logout', [PlatformAuthController::class, 'logout']);
        Route::get('/me', [PlatformAuthController::class, 'me']);
        Route::patch('/me', [PlatformProfileController::class, 'update']);
        Route::patch('/me/password', [PlatformProfileController::class, 'changePassword']);
        Route::get('/users/{platformUser}/photo', [PlatformProfileController::class, 'photo']);

        Route::get('/dashboard', [PlatformDashboardController::class, 'show']);
        Route::get('/audit-logs', [PlatformAuditLogController::class, 'index']);

        Route::get('/settings', [PlatformSettingController::class, 'show']);
        Route::patch('/settings', [PlatformSettingController::class, 'update']);

        Route::get('/plans/manage', [PlatformPlanController::class, 'manage']);
        Route::post('/plans', [PlatformPlanController::class, 'store']);
        Route::patch('/plans/{platformPlan}', [PlatformPlanController::class, 'update']);
        Route::get('/plans', [PlatformPlanController::class, 'index']);
        Route::get('/roles', [PlatformRoleController::class, 'index']);
        Route::post('/roles', [PlatformRoleController::class, 'store']);
        Route::patch('/roles/{platformRole}', [PlatformRoleController::class, 'update']);

        Route::get('/users/stats', [PlatformUserController::class, 'stats']);
        Route::get('/users', [PlatformUserController::class, 'index']);
        Route::post('/users', [PlatformUserController::class, 'store']);
        Route::patch('/users/{platformUser}', [PlatformUserController::class, 'update']);
        Route::post('/users/{platformUser}/reset-password', [PlatformUserController::class, 'resetPassword']);
        Route::get('/users/{platformUser}/activity', [PlatformUserController::class, 'activity']);

        Route::post('/pressings/{pressing}/renew', [PlatformPressingController::class, 'renew']);
        Route::post('/pressings/{pressing}/impersonate', [PlatformPressingController::class, 'impersonate']);
        Route::get('/pressings', [PlatformPressingController::class, 'index']);
        Route::post('/pressings', [PlatformPressingController::class, 'store']);
        Route::get('/pressings/{pressing}', [PlatformPressingController::class, 'show']);
        Route::patch('/pressings/{pressing}', [PlatformPressingController::class, 'update']);
        Route::post('/pressings/{pressing}/suspend', [PlatformPressingController::class, 'suspend']);
        Route::post('/pressings/{pressing}/reactivate', [PlatformPressingController::class, 'reactivate']);
        Route::post('/pressings/{pressing}/rotate-report-token', [PlatformPressingController::class, 'rotateReportToken']);
    });
});

Route::middleware(['auth:sanctum', 'pressing'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::post('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::get('/users/{user}/photo', [ProfileController::class, 'photo']);
    Route::get('/agencies', [AgencyController::class, 'index']);
    Route::get('/agencies/manage', [AgencyController::class, 'manage']);
    Route::get('/agencies/{agency}', [AgencyController::class, 'show']);
    Route::post('/agencies', [AgencyController::class, 'store']);
    Route::patch('/agencies/{agency}', [AgencyController::class, 'update']);
    Route::get('/agencies/{agency}/settings', [AgencySettingController::class, 'show']);
    Route::patch('/agencies/{agency}/settings', [AgencySettingController::class, 'update']);

    Route::get('/multi-agencies', [MultiAgencyController::class, 'overview']);
    Route::get('/multi-agencies/{agency}', [MultiAgencyController::class, 'show']);

    Route::post('/settings', [SettingsController::class, 'update']);
    Route::get('/settings/recent-changes', [SettingsController::class, 'recentChanges']);
    Route::patch('/settings/draft', [SettingsController::class, 'saveDraft']);
    Route::post('/settings/draft/discard', [SettingsController::class, 'discardDraft']);
    Route::post('/settings/publish', [SettingsController::class, 'publish']);
    Route::get('/settings/versions', [SettingsController::class, 'versions']);
    Route::post('/settings/versions/{version}/restore', [SettingsController::class, 'restoreVersion']);

    // Lecture seule (statut + historique) — gestion/renouvellement désormais exclusivement
    // côté plateforme, voir CLAUDE.md « Licence / facturation — gap d'harmonisation ».
    Route::get('/license', [LicenseController::class, 'show']);
    Route::get('/license/history', [LicenseController::class, 'history']);

    // Recherche globale (en-tête, raccourci ⌘K) et cloche d'alertes (chantier
    // « En-tête global », audit Figma 2026-10-06) — pas de permission dédiée,
    // chaque contrôleur applique son propre gating par signal (voir leur code).
    Route::get('/search', [SearchController::class, 'index']);
    Route::get('/staff-alerts', [StaffAlertController::class, 'index']);

    Route::get('/clients/stats', [ClientController::class, 'stats']);
    Route::apiResource('clients', ClientController::class)->except(['destroy'])->parameters(['clients' => 'client']);
    Route::delete('/clients/{client}', [ClientController::class, 'destroy']);

    Route::get('/services', [ServiceController::class, 'index']);
    Route::get('/services/catalog', [ServiceController::class, 'catalog']);
    Route::get('/services/stats', [ServiceController::class, 'stats']);
    Route::get('/services/export', [ServiceController::class, 'export']);
    Route::post('/services/import', [ServiceController::class, 'import']);
    Route::get('/services/price-history', [ServiceController::class, 'priceHistory']);
    Route::post('/services/{service}/duplicate', [ServiceController::class, 'duplicate']);
    Route::get('/services/{service}', [ServiceController::class, 'show']);
    Route::post('/services', [ServiceController::class, 'store']);
    Route::patch('/services/{service}', [ServiceController::class, 'update']);
    Route::patch('/agencies/{agency}/services/{service}', [ServiceController::class, 'updatePricing']);

    Route::get('/intake-conditions', [IntakeConditionController::class, 'index']);

    Route::get('/loyalty-tiers', [LoyaltyTierController::class, 'index']);
    Route::post('/loyalty-tiers', [LoyaltyTierController::class, 'store']);
    Route::patch('/loyalty-tiers/{loyaltyTier}', [LoyaltyTierController::class, 'update']);

    Route::get('/treatment-types', [TreatmentTypeController::class, 'index']);
    Route::post('/treatment-types', [TreatmentTypeController::class, 'store']);
    Route::patch('/treatment-types/{treatmentType}', [TreatmentTypeController::class, 'update']);

    Route::get('/orders', [OrderController::class, 'index']);
    Route::get('/orders/stats', [OrderController::class, 'stats']);
    Route::get('/orders/export', [OrderController::class, 'export']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::patch('/orders/{order}', [OrderController::class, 'update']);
    Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel']);
    Route::post('/orders/{order}/invoice', [InvoiceController::class, 'storeForOrder']);
    Route::get('/orders/{order}/audit-logs', [AuditLogController::class, 'forOrder']);
    Route::get('/orders/{order}/ticket-pdf', [DocumentController::class, 'ticketPdf']);
    Route::post('/orders/{order}/documents/{type}/send', [DocumentController::class, 'send']);

    Route::get('/audit-logs', [AuditLogController::class, 'index']);

    Route::get('/atelier/staff', [AtelierController::class, 'staff']);
    Route::get('/atelier/board', [AtelierController::class, 'board']);
    Route::post('/atelier/orders/{order}/advance', [AtelierController::class, 'advance']);
    Route::patch('/atelier/orders/{order}/priority', [AtelierController::class, 'updatePriority']);
    Route::patch('/atelier/orders/{order}/responsables', [AtelierController::class, 'updateResponsables']);

    Route::get('/pickups', [PickupController::class, 'index']);
    Route::get('/pickups/summary', [PickupController::class, 'summary']);
    Route::post('/orders/{order}/pickups', [PickupController::class, 'store']);

    Route::patch('/order-items/{orderItem}/status', [OrderItemController::class, 'updateStatus']);
    Route::get('/order-items/{orderItem}/qr-code', [OrderItemController::class, 'qrImage']);
    Route::get('/order-items/scan/{qrCode}', [OrderItemController::class, 'showByQrCode']);

    Route::get('/invoices', [InvoiceController::class, 'index']);
    Route::get('/invoices/{invoice}', [InvoiceController::class, 'show']);
    Route::get('/invoices/{invoice}/pdf', [InvoiceController::class, 'downloadPdf']);

    Route::post('/payments/cash', [PaymentController::class, 'storeCash']);
    Route::post('/payments/remote', [PaymentController::class, 'initiateRemote']);
    Route::post('/payments/manual', [PaymentController::class, 'storeManual']);
    Route::get('/payments/{payment}', [PaymentController::class, 'show']);

    Route::get('/cash/summary', [CashController::class, 'summary']);
    Route::get('/cash/stats', [CashController::class, 'stats']);
    Route::get('/cash/payment-breakdown', [CashController::class, 'paymentBreakdown']);
    Route::get('/cash/flow-series', [CashController::class, 'flowSeries']);
    Route::get('/cash/ledger', [CashController::class, 'ledger']);
    Route::get('/cash/ledger/export/pdf', [CashController::class, 'exportLedgerPdf']);
    Route::get('/cash/ledger/export/excel', [CashController::class, 'exportLedgerExcel']);
    Route::get('/cash/movements/eligible-validators', [CashController::class, 'eligibleValidators']);
    Route::get('/cash/movements', [CashController::class, 'indexMovements']);
    Route::post('/cash/movements', [CashController::class, 'storeMovement']);
    Route::post('/cash/movements/{movement}/validate', [CashController::class, 'validateMovement']);
    Route::get('/cash/movements/{movement}/proof', [CashController::class, 'movementProof']);
    Route::get('/cash/movements/{movement}', [CashController::class, 'showMovement']);
    Route::get('/cash/closures/precheck', [CashController::class, 'closurePrecheck']);
    Route::get('/cash/closures/operators', [CashController::class, 'closureOperators']);
    Route::get('/cash/closures', [CashController::class, 'indexClosures']);
    Route::get('/cash/closures/{closure}', [CashController::class, 'showClosure']);
    Route::post('/cash/closures', [CashController::class, 'storeClosure']);
    Route::get('/cash/closures/{closure}/pdf', [CashController::class, 'closurePdf']);

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
    Route::post('/roles', [RoleController::class, 'store']);
    Route::patch('/roles/{role}', [RoleController::class, 'update']);
    Route::delete('/roles/{role}', [RoleController::class, 'destroy']);
    Route::get('/permissions', [PermissionController::class, 'index']);

    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::patch('/users/{user}', [UserController::class, 'update']);
    Route::post('/users/{user}/photo', [UserController::class, 'updatePhoto']);
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
    Route::get('/kpi/revenue-series', [KpiController::class, 'revenueSeries']);

    Route::get('/reports/daily', [ReportController::class, 'daily']);
    Route::get('/reports/daily/export/excel', [ReportController::class, 'exportExcel']);

    Route::get('/notification-settings', [NotificationSettingController::class, 'index']);
    Route::post('/notification-settings', [NotificationSettingController::class, 'store']);

    Route::get('/notification-logs', [NotificationLogController::class, 'index']);
});
