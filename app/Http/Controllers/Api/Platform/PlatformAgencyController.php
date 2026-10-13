<?php

namespace App\Http\Controllers\Api\Platform;

use App\Models\Agency;
use App\Models\AgencySetting;
use App\Models\Order;
use App\Models\Pressing;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Écran « Agences » cross-tenant (audit Figma du 2026-10-13). Depuis le pivot
 * multi-tenant, plateforme et pressings partagent la même base : les agences, leurs
 * réglages opérationnels et leurs volumes sont lus et modifiés directement, sans canal
 * de synchronisation fictif. Scopé aux pressings affectés pour un non-superadmin.
 */
class PlatformAgencyController extends PlatformApiController
{
    private const ACTIVITY_DAYS = 30;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'pressings.manage');
        $pressingIds = $this->resolvePressingFilter($user);

        $query = Agency::query()
            ->with(['pressing:id,name,code,country_code,status', 'settings'])
            ->withCount([
                'users as staff_count',
                'orders as deposits_30d' => fn ($q) => $q->where('created_at', '>=', now()->subDays(self::ACTIVITY_DAYS)),
                'services as local_price_overrides' => fn ($q) => $q->whereNotNull('agency_services.price_override'),
            ])
            ->when($pressingIds !== null, fn ($q) => $q->whereIn('pressing_id', $pressingIds))
            ->when($request->filled('pressing_id'), fn ($q) => $q->where('pressing_id', $request->integer('pressing_id')))
            ->when($request->filled('country_code'), fn ($q) => $q->whereHas('pressing', fn ($p) => $p->where('country_code', $request->string('country_code'))))
            ->when($request->string('status')->toString() === 'active', fn ($q) => $q->where('is_active', true))
            ->when($request->string('status')->toString() === 'inactive', fn ($q) => $q->where('is_active', false))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search')->trim().'%';
                $q->where(fn ($s) => $s->where('name', 'ilike', $term)->orWhere('city', 'ilike', $term)->orWhere('code', 'ilike', $term));
            });

        $query = match ($request->string('sort')->toString()) {
            'name' => $query->orderBy('name'),
            default => $query->orderByDesc('deposits_30d')->orderBy('name'),
        };

        $page = $query->paginate($request->integer('per_page', 20));
        $managers = $this->managersFor($page->getCollection()->pluck('pressing_id')->unique()->all());
        $page->getCollection()->transform(fn (Agency $agency) => $this->present($agency, $managers[$agency->pressing_id] ?? null));

        return response()->json($page);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'pressings.manage');
        $data = $this->validated($request, null);
        $this->authorizePressing($user, (int) $data['pressing_id']);

        $agency = DB::transaction(function () use ($data) {
            $agency = Agency::create(collect($data)->only($this->agencyFields())->all() + ['pressing_id' => $data['pressing_id']])->refresh();
            AgencySetting::forAgency($agency->id)->update($this->settingsFrom($data));
            // Même garantie que la création d'article : une agence neuve propose
            // immédiatement le catalogue actif de son pressing au comptoir.
            $services = Service::query()->where('pressing_id', $agency->pressing_id)->where('is_active', true)->pluck('id');
            $agency->services()->syncWithoutDetaching($services->mapWithKeys(fn ($id) => [$id => ['is_active' => true]])->all());

            return $agency;
        });

        return response()->json($this->present($agency->fresh(['pressing', 'settings'])), 201);
    }

    public function update(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        $this->authorizePermission($user, 'pressings.manage');
        $this->authorizePressing($user, $agency->pressing_id);
        $data = $this->validated($request, $agency);

        DB::transaction(function () use ($agency, $data) {
            $agency->update(collect($data)->only($this->agencyFields())->all());
            $settings = $this->settingsFrom($data);
            if ($settings !== []) {
                AgencySetting::forAgency($agency->id)->update($settings);
            }
        });

        return response()->json($this->present($agency->fresh(['pressing', 'settings'])));
    }

    private function agencyFields(): array
    {
        return ['code', 'name', 'city', 'address', 'phone', 'email', 'opens_at', 'closes_at', 'opening_days', 'is_active'];
    }

    private function settingsFrom(array $data): array
    {
        return collect($data)->only([
            'order_number_prefix', 'order_number_suffix', 'standard_delay_hours', 'express_delay_hours', 'washer_step_enabled', 'sorter_step_enabled',
        ])->all();
    }

    private function validated(Request $request, ?Agency $agency): array
    {
        $pressingId = $agency?->pressing_id ?? $request->integer('pressing_id');

        return $request->validate([
            'pressing_id' => [$agency ? 'prohibited' : 'required', 'integer', 'exists:pressings,id'],
            'code' => [$agency ? 'prohibited' : 'required', 'string', 'max:20', Rule::unique('agencies', 'code')->where('pressing_id', $pressingId)],
            'name' => [$agency ? 'sometimes' : 'required', 'string', 'max:120'],
            'city' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:255'],
            'opens_at' => ['nullable', 'date_format:H:i'],
            'closes_at' => ['nullable', 'date_format:H:i', 'after:opens_at'],
            'opening_days' => ['nullable', 'array'],
            'opening_days.*' => ['integer', 'between:1,7'],
            'is_active' => ['sometimes', 'boolean'],
            'order_number_prefix' => ['nullable', 'string', 'max:10'],
            'order_number_suffix' => ['nullable', 'string', 'max:10'],
            'standard_delay_hours' => ['nullable', 'integer', 'min:0', 'max:720'],
            'express_delay_hours' => ['nullable', 'integer', 'min:0', 'max:720'],
            'washer_step_enabled' => ['sometimes', 'boolean'],
            'sorter_step_enabled' => ['sometimes', 'boolean'],
        ]);
    }

    /** Responsable de chaque pressing = compte manager bootstrap (même règle que la liste des pressings). */
    private function managersFor(array $pressingIds): array
    {
        return \App\Models\User::query()
            ->whereIn('pressing_id', $pressingIds)
            ->whereNull('agency_id')
            ->whereHas('role', fn ($r) => $r->where('slug', 'admin'))
            ->orderBy('id')
            ->get(['id', 'pressing_id', 'name'])
            ->unique('pressing_id')
            ->mapWithKeys(fn ($u) => [$u->pressing_id => $u->name])
            ->all();
    }

    private function present(Agency $agency, ?string $manager = null): array
    {
        $settings = $agency->settings ?? AgencySetting::forAgency($agency->id);
        $manager ??= $this->managersFor([$agency->pressing_id])[$agency->pressing_id] ?? null;

        return [
            'id' => $agency->id,
            'code' => $agency->code,
            'name' => $agency->name,
            'city' => $agency->city,
            'address' => $agency->address,
            'phone' => $agency->phone,
            'email' => $agency->email,
            'manager_name' => $manager,
            'local_price_overrides' => $agency->local_price_overrides ?? $agency->services()->whereNotNull('agency_services.price_override')->count(),
            'is_active' => $agency->is_active,
            'opens_at' => $agency->opens_at ? substr($agency->opens_at, 0, 5) : null,
            'closes_at' => $agency->closes_at ? substr($agency->closes_at, 0, 5) : null,
            'opening_days' => $agency->opening_days,
            'pressing' => $agency->pressing?->only(['id', 'name', 'code', 'country_code', 'status']),
            'staff_count' => $agency->staff_count ?? $agency->users()->count(),
            'deposits_30d' => $agency->deposits_30d ?? Order::query()->where('agency_id', $agency->id)->where('created_at', '>=', now()->subDays(self::ACTIVITY_DAYS))->count(),
            'settings' => [
                'order_number_prefix' => $settings->order_number_prefix,
                'order_number_suffix' => $settings->order_number_suffix,
                'order_number_padding' => $settings->order_number_padding,
                'standard_delay_hours' => $settings->standard_delay_hours,
                'express_delay_hours' => $settings->express_delay_hours,
                'washer_step_enabled' => $settings->washer_step_enabled,
                'sorter_step_enabled' => $settings->sorter_step_enabled,
            ],
        ];
    }
}
