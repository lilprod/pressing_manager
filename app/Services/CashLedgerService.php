<?php

namespace App\Services;

use App\Models\CashClosure;
use App\Models\CashMovement;
use App\Models\Payment;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Journal de caisse unifié (écran "Centre de caisse", maquette Figma) : assemble les
 * mouvements manuels (CashMovement), les encaissements (Payment) et les clôtures
 * (CashClosure) d'une agence dans un flux chronologique unique, sans dupliquer la
 * moindre donnée — chaque ligne pointe vers l'enregistrement réel dont elle est issue.
 *
 * Décision de conception : le filtre "mode de paiement" de la maquette n'a de sens
 * que sur les lignes "encaissement" (un Payment a un vrai `method`) ; les lignes
 * "mouvement" sont toujours en espèces par construction (CashService ne gère que les
 * espèces manuelles) — leur `method` est donc fixé à "espece", pas un choix fabriqué.
 */
class CashLedgerService
{
    /**
     * @param  array{type?:string,status?:string,method?:string,search?:string,from?:string,to?:string}  $filters
     */
    public function query(int $agencyId, array $filters): Builder
    {
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        $movements = CashMovement::query()
            ->leftJoin('users as cm_creator', 'cm_creator.id', '=', 'cash_movements.created_by')
            ->where('cash_movements.agency_id', $agencyId)
            ->when($from, fn ($query) => $query->whereDate('cash_movements.occurred_at', '>=', $from))
            ->when($to, fn ($query) => $query->whereDate('cash_movements.occurred_at', '<=', $to))
            ->selectRaw(<<<'SQL'
                cash_movements.occurred_at as date,
                cash_movements.reference as reference,
                cash_movements.category as category,
                cm_creator.name as agent_name,
                cash_movements.amount as amount,
                case when cash_movements.type = 'entree' then '+' else '-' end as direction,
                cash_movements.status as status,
                'mouvement' as kind,
                'espece' as method,
                cash_movements.id as source_id,
                cash_movements.id as movement_id
            SQL)
            ->toBase();

        $payments = Payment::query()
            ->leftJoin('users as p_receiver', 'p_receiver.id', '=', 'payments.received_by')
            ->where('payments.agency_id', $agencyId)
            ->when($from, fn ($query) => $query->whereDate(DB::raw('coalesce(payments.paid_at, payments.created_at)'), '>=', $from))
            ->when($to, fn ($query) => $query->whereDate(DB::raw('coalesce(payments.paid_at, payments.created_at)'), '<=', $to))
            ->selectRaw(<<<'SQL'
                coalesce(payments.paid_at, payments.created_at) as date,
                payments.external_reference as reference,
                payments.method as category,
                p_receiver.name as agent_name,
                payments.amount as amount,
                '+' as direction,
                payments.status as status,
                'encaissement' as kind,
                payments.method as method,
                payments.id as source_id,
                null as movement_id
            SQL)
            ->toBase();

        $closures = CashClosure::query()
            ->leftJoin('users as c_closer', 'c_closer.id', '=', 'cash_closures.closed_by')
            ->where('cash_closures.agency_id', $agencyId)
            ->when($from, fn ($query) => $query->whereDate('cash_closures.business_date', '>=', $from))
            ->when($to, fn ($query) => $query->whereDate('cash_closures.business_date', '<=', $to))
            ->selectRaw(<<<'SQL'
                cash_closures.closed_at as date,
                cast(cash_closures.business_date as text) as reference,
                'cloture' as category,
                c_closer.name as agent_name,
                cash_closures.counted_balance as amount,
                cast(null as text) as direction,
                case when cash_closures.variance = 0 then 'conforme' else 'ecart' end as status,
                'cloture' as kind,
                cast(null as text) as method,
                cash_closures.id as source_id,
                null as movement_id
            SQL)
            ->toBase();

        $union = $movements->unionAll($payments)->unionAll($closures);

        $search = $filters['search'] ?? null;

        return DB::query()
            ->fromSub($union, 'ledger')
            ->when($filters['type'] ?? null, fn ($query, $kind) => $query->where('kind', $kind))
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($filters['method'] ?? null, fn ($query, $method) => $query->where('method', $method))
            ->when($search, function ($query) use ($search) {
                $like = '%'.$search.'%';
                $query->where(function ($inner) use ($like) {
                    $inner->where('reference', 'ilike', $like)
                        ->orWhere('category', 'ilike', $like)
                        ->orWhere('agent_name', 'ilike', $like);
                });
            })
            ->orderByDesc('date');
    }
}
