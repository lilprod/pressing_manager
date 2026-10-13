<?php

namespace App\Http\Controllers\Api;

use App\Models\AuthEvent;
use App\Models\CashSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Sessions de caisse par caissier : ouverture (fond de caisse), pause/reprise,
 * clôture avec comptage → écart réel. Les encaissements faits pendant une session
 * ouverte y sont rattachés (PaymentService::openSessionId).
 */
class CashSessionController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $agencyIds = $this->resolveAgencyFilter($request, $request->user());
        $date = $request->filled('date') ? Carbon::parse($request->string('date')->value()) : now();

        $sessions = CashSession::query()
            ->with('cashier:id,name')
            ->whereIn('agency_id', $agencyIds)
            ->where(fn ($q) => $q->whereDate('opened_at', $date->toDateString())
                ->orWhere(fn ($open) => $open->where('status', '!=', 'closed')->whereDate('opened_at', '<=', $date->toDateString())))
            ->orderBy('register_label')
            ->get()
            ->map(fn (CashSession $s) => $this->present($s));

        return response()->json($sessions);
    }

    /** Session courante du caissier connecté (pour le bandeau de caisse). */
    public function mine(Request $request): JsonResponse
    {
        $session = CashSession::query()
            ->where('user_id', $request->user()->id)
            ->where('status', '!=', 'closed')
            ->latest('opened_at')
            ->first();

        return response()->json($session ? $this->present($session) : null);
    }

    public function open(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $data = $request->validate([
            'register_label' => ['required', 'string', 'max:40'],
            'opening_float' => ['required', 'integer', 'min:0', 'max:100000000'],
            'agency_id' => ['nullable', 'integer'],
        ]);
        $agencyId = $request->user()->effectiveAgencyId($data['agency_id'] ?? null);
        if (! $agencyId) {
            throw new HttpException(422, 'Sélectionnez une agence.');
        }
        $this->authorizeAgency($request->user(), $agencyId);

        if (CashSession::where('user_id', $request->user()->id)->where('status', '!=', 'closed')->exists()) {
            throw new HttpException(422, 'Vous avez déjà une session de caisse ouverte.');
        }
        if (CashSession::where('agency_id', $agencyId)->where('register_label', $data['register_label'])->where('status', '!=', 'closed')->exists()) {
            throw new HttpException(422, 'Cette caisse est déjà ouverte par un autre caissier.');
        }

        $session = CashSession::create([
            'agency_id' => $agencyId,
            'user_id' => $request->user()->id,
            'register_label' => $data['register_label'],
            'opening_float' => $data['opening_float'],
            'status' => 'open',
            'opened_at' => now(),
        ]);
        AuthEvent::record('cash_session_opened', $request->user(), $request, ['session_id' => $session->id, 'register' => $session->register_label]);

        return response()->json($this->present($session), 201);
    }

    public function pause(Request $request, CashSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);
        if ($session->status !== 'open') {
            throw new HttpException(422, 'Seule une session ouverte peut être mise en pause.');
        }
        $session->update(['status' => 'paused', 'paused_at' => now()]);

        return response()->json($this->present($session));
    }

    public function resume(Request $request, CashSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);
        if ($session->status !== 'paused') {
            throw new HttpException(422, 'Cette session n\'est pas en pause.');
        }
        $session->update(['status' => 'open', 'paused_at' => null]);

        return response()->json($this->present($session));
    }

    public function close(Request $request, CashSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);
        if ($session->status === 'closed') {
            throw new HttpException(422, 'Session déjà clôturée.');
        }
        $data = $request->validate(['counted_amount' => ['required', 'integer', 'min:0'], 'notes' => ['nullable', 'string', 'max:500']]);
        $expected = $session->expectedCash();
        $variance = $data['counted_amount'] - $expected;
        if ($variance !== 0 && empty($data['notes'])) {
            throw new HttpException(422, 'Un commentaire est obligatoire en cas d\'écart.');
        }

        $session->update([
            'status' => 'closed',
            'closed_at' => now(),
            'expected_amount' => $expected,
            'counted_amount' => $data['counted_amount'],
            'variance' => $variance,
            'notes' => $data['notes'] ?? null,
        ]);
        AuthEvent::record('cash_session_closed', $request->user(), $request, ['session_id' => $session->id, 'variance' => $variance]);

        return response()->json($this->present($session));
    }

    /** Le caissier ou un responsable de la même agence (payments.manage) peut agir sur la session. */
    private function authorizeSession(Request $request, CashSession $session): void
    {
        $this->authorizePermission($request->user(), 'payments.manage');
        $this->authorizeAgency($request->user(), $session->agency_id);
    }

    private function present(CashSession $session): array
    {
        $session->loadMissing('cashier:id,name');
        $payments = $session->payments()->where('status', 'complete');

        // Projection minimale du caissier : jamais les $appends de User (expiration de mot de passe, MFA…).
        return ['cashier' => $session->cashier ? ['id' => $session->cashier->id, 'name' => $session->cashier->name] : null]
            + $session->toArray() + [
            'collected_total' => (int) (clone $payments)->sum('amount'),
            'transactions_count' => (clone $payments)->count(),
            'expected_now' => $session->status === 'closed' ? $session->expected_amount : $session->expectedCash(),
        ];
    }
}
