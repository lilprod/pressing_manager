<?php

namespace App\Services;

use App\Models\CashMovement;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Double contrôle sur mouvement sensible (voir config('cash.sensitive_movement_threshold')) :
 * un mouvement manuel au-delà du seuil est créé "en_attente" — exclu du solde théorique
 * (CashService::previewBalance) et bloquant pour la clôture — jusqu'à ce qu'un second
 * utilisateur habilité le valide explicitement. Pas de notification au contrôleur pour
 * cette version (aucun canal de notification interne aux utilisateurs n'existe encore,
 * voir CLAUDE.md) — à surfacer uniquement via la liste des mouvements en attente.
 */
class CashMovementService
{
    public function create(array $data, User $actor): CashMovement
    {
        $threshold = config('cash.sensitive_movement_threshold');
        $status = $data['amount'] >= $threshold ? 'en_attente' : 'valide';

        $proofPath = null;
        if (isset($data['proof']) && $data['proof'] instanceof UploadedFile) {
            $proofPath = $data['proof']->store('cash-movements', ['disk' => config('filesystems.default')]);
        }

        return CashMovement::create([
            'agency_id' => $data['agency_id'],
            'type' => $data['type'],
            'category' => $data['category'],
            'amount' => $data['amount'],
            'reason' => $data['reason'],
            'counterparty' => $data['counterparty'] ?? null,
            'reference' => $data['reference'] ?? null,
            'note' => $data['note'] ?? null,
            'proof_path' => $proofPath,
            'status' => $status,
            'created_by' => $actor->id,
            'occurred_at' => now(),
        ]);
    }

    public function validate(CashMovement $movement, User $actor): CashMovement
    {
        return DB::transaction(function () use ($movement, $actor) {
            if ($movement->status !== 'en_attente') {
                throw new HttpException(422, 'Ce mouvement ne nécessite pas de validation.');
            }

            $movement->status = 'valide';
            $movement->validated_by = $actor->id;
            $movement->validated_at = now();
            $movement->save();

            return $movement;
        });
    }
}
