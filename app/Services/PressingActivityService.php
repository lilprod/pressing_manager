<?php

namespace App\Services;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\AuthEvent;
use App\Models\Pressing;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Journal d'activité d'un pressing vu depuis la console plateforme : fusion des entrées
 * `audit_logs` de ses agences (et de ses réglages pressing) et du journal des connexions
 * `auth_events` de son personnel. Le résultat (succès/échec) n'existe réellement que
 * pour les évènements d'authentification : une écriture auditée a forcément abouti.
 */
class PressingActivityService
{
    public const FAILURE_TYPES = ['login_failed', 'login_locked', 'mfa_failed'];

    public const CONFIGURATION_TYPES = [Agency::class, AppSetting::class, AgencySetting::class];

    public function query(Pressing $pressing, array $filters): Builder
    {
        $agencyIds = $pressing->agencies()->pluck('id')->all();
        $appSettingId = AppSetting::query()->where('pressing_id', $pressing->id)->value('id');

        $audit = DB::table('audit_logs as a')
            ->selectRaw("'audit' as source, a.id, a.created_at, a.auditable_type as subject, a.action as kind, a.agency_id, a.user_id, a.ip_address, 'success' as result, cast(a.auditable_id as text) as resource_id")
            ->where(function ($q) use ($agencyIds, $appSettingId) {
                $q->whereIn('a.agency_id', $agencyIds ?: [0]);
                if ($appSettingId) {
                    $q->orWhere(fn ($w) => $w->where('a.auditable_type', AppSetting::class)->where('a.auditable_id', $appSettingId));
                }
            });

        $failures = "'".implode("','", self::FAILURE_TYPES)."'";
        $auth = DB::table('auth_events as e')
            ->leftJoin('users as u', 'u.id', '=', 'e.user_id')
            ->selectRaw("'auth' as source, e.id, e.created_at, 'auth' as subject, e.type as kind, u.agency_id, e.user_id, e.ip_address, case when e.type in ($failures) then 'failure' else 'success' end as result, cast(null as text) as resource_id")
            ->where('e.pressing_id', $pressing->id);

        foreach ([$audit, $auth] as $branch) {
            $column = $branch === $audit ? 'a.created_at' : 'e.created_at';
            if (! empty($filters['from'])) {
                $branch->where($column, '>=', Carbon::parse($filters['from'])->startOfDay());
            }
            if (! empty($filters['to'])) {
                $branch->where($column, '<=', Carbon::parse($filters['to'])->endOfDay());
            }
        }

        $category = $filters['category'] ?? null;
        if ($category === 'security') {
            $audit->whereRaw('1 = 0');
        } elseif ($category === 'configuration') {
            $auth->whereRaw('1 = 0');
            $audit->whereIn('a.auditable_type', self::CONFIGURATION_TYPES);
        } elseif ($category === 'operations') {
            $auth->whereRaw('1 = 0');
            $audit->whereNotIn('a.auditable_type', self::CONFIGURATION_TYPES);
        }

        $query = DB::query()->fromSub($audit->unionAll($auth), 'j');

        if (! empty($filters['agency_id'])) {
            $query->where('j.agency_id', (int) $filters['agency_id']);
        }
        if (in_array($filters['result'] ?? null, ['success', 'failure'], true)) {
            $query->where('j.result', $filters['result']);
        }
        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $userIds = User::query()->where('pressing_id', $pressing->id)->where('name', 'ilike', $term)->pluck('id')->all();
            $query->where(function ($q) use ($term, $userIds) {
                $q->where('j.kind', 'ilike', $term)
                    ->orWhere('j.subject', 'ilike', $term)
                    ->orWhere('j.ip_address', 'ilike', $term)
                    ->orWhere('j.resource_id', 'ilike', $term)
                    ->orWhereIn('j.user_id', $userIds ?: [0]);
            });
        }

        return $query->orderByDesc('j.created_at')->orderByDesc('j.id');
    }

    public function paginate(Pressing $pressing, array $filters, int $perPage = 10): LengthAwarePaginator
    {
        $page = $this->query($pressing, $filters)->paginate($perPage);
        $page->setCollection(collect($this->hydrate($page->items())));

        return $page;
    }

    /** @return array<int, array<string, mixed>> */
    public function all(Pressing $pressing, array $filters, int $limit = 5000): array
    {
        return $this->hydrate($this->query($pressing, $filters)->limit($limit)->get()->all());
    }

    /** @param  array<int, object>  $rows */
    private function hydrate(array $rows): array
    {
        $rows = collect($rows);
        $users = User::query()->with('role:id,slug,name')->whereIn('id', $rows->pluck('user_id')->filter()->unique())
            ->get(['id', 'name', 'role_id'])->keyBy('id');
        $agencies = Agency::query()->whereIn('id', $rows->pluck('agency_id')->filter()->unique())->pluck('name', 'id');
        $audits = AuditLog::query()->whereIn('id', $rows->where('source', 'audit')->pluck('id'))->get(['id', 'old_values', 'new_values', 'user_agent'])->keyBy('id');
        $auths = AuthEvent::query()->whereIn('id', $rows->where('source', 'auth')->pluck('id'))->get(['id', 'meta', 'user_agent'])->keyBy('id');

        return $rows->map(function ($row) use ($users, $agencies, $audits, $auths) {
            $user = $row->user_id ? $users->get($row->user_id) : null;
            $detail = $row->source === 'audit' ? $audits->get($row->id) : $auths->get($row->id);

            return [
                'key' => $row->source.'-'.$row->id,
                'source' => $row->source,
                'created_at' => Carbon::parse($row->created_at)->toIso8601String(),
                'subject' => $row->subject === 'auth' ? 'auth' : class_basename($row->subject),
                'kind' => $row->source === 'audit' ? \Illuminate\Support\Str::afterLast($row->kind, '.') : $row->kind,
                'resource_id' => $row->resource_id,
                'agency_name' => $row->agency_id ? ($agencies[$row->agency_id] ?? null) : null,
                'actor_name' => $user?->name,
                'actor_role' => $user?->role?->name,
                'ip_address' => $row->ip_address,
                'result' => $row->result,
                'user_agent' => $detail?->user_agent,
                'old_values' => $row->source === 'audit' ? $detail?->old_values : null,
                'new_values' => $row->source === 'audit' ? $detail?->new_values : ($detail?->meta),
            ];
        })->all();
    }
}
