<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\License\RenewLicenseRequest;
use App\Models\License;
use App\Services\LicenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class LicenseController extends ApiController
{
    public function __construct(private readonly LicenseService $licenses) {}

    /**
     * Statut courant, consultable par n'importe quel utilisateur authentifié
     * (le frontend en a besoin pour afficher le bandeau/écran de blocage),
     * quel que soit le statut de la licence (voir CheckLicenseStatus).
     */
    public function show(): JsonResponse
    {
        $license = License::current();

        if ($license === null) {
            throw new HttpException(404, 'Aucune licence configurée.');
        }

        $license->refreshStatus();

        return response()->json([
            ...$license->toArray(),
            'grace_ends_at' => $license->graceEndsAt(),
            'days_remaining' => (int) now()->diffInDays($license->expires_at, false),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'licenses.manage');

        $license = License::current();

        return response()->json($license?->payments()->latest('paid_at')->get() ?? []);
    }

    public function renew(RenewLicenseRequest $request): JsonResponse
    {
        $license = License::current();

        if ($license === null) {
            throw new HttpException(404, 'Aucune licence configurée.');
        }

        $data = $request->validated();
        $payment = $this->licenses->renew($license, $data['plan'], $data['method'], $data['external_reference'] ?? null);

        return response()->json([
            'license' => $license->fresh(),
            'payment' => $payment,
        ], 201);
    }

    public function plans(): JsonResponse
    {
        return response()->json(config('licensing.plans'));
    }
}
