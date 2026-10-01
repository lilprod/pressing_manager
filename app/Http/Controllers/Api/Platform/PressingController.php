<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\StorePressingRequest;
use App\Http\Requests\Platform\UpdatePressingRequest;
use App\Models\Agency;
use App\Models\Pressing;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class PressingController extends PlatformApiController
{
    private const LICENSE_FIELDS = ['platform_plan_id', 'license_starts_at', 'license_expires_at'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Pressing::query()->with('platformPlan')->latest();

        $pressingIds = $this->resolvePressingFilter($user);
        if ($pressingIds !== null) {
            $query->whereIn('id', $pressingIds);
        }

        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($q) => $q->where('name', 'ilike', "%{$search}%")->orWhere('code', 'ilike', "%{$search}%"));
        }

        if ($request->filled('country_code')) {
            $query->where('country_code', $request->string('country_code'));
        }

        if ($request->filled('platform_plan_id')) {
            $query->where('platform_plan_id', $request->integer('platform_plan_id'));
        }

        if ($request->string('status')->toString() === 'renewal_due') {
            $query->whereNotNull('license_expires_at')
                ->where('license_expires_at', '>', now())
                ->where('license_expires_at', '<=', now()->addDays(30));
        } elseif ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return response()->json($query->paginate($request->integer('per_page', 15)));
    }

    /**
     * Provisionnement réel (pivot multi-tenant, voir CLAUDE.md « Pivot
     * multi-tenant ») : crée le pressing ET sa première agence ET un compte
     * manager bootstrap, dans la même transaction — avant cette passe, créer un
     * pressing n'était qu'une ligne de registre, sans aucun espace réellement
     * utilisable derrière. Des agences supplémentaires s'ajoutent ensuite via
     * l'écran /agencies existant (déjà un CRUD complet, maintenant scopé par
     * pressing), pas re-fabriqué ici.
     */
    public function store(StorePressingRequest $request): JsonResponse
    {
        // Pas de vérification d'affectation ici : un pressing n'existe pas encore,
        // donc rien à affecter — la permission pressings.manage suffit.
        $this->authorizePermission($request->user(), 'pressings.manage');

        $data = $request->validated();
        $pressingFields = Arr::except($data, ['agency_code', 'agency_name', 'agency_city', 'manager_name', 'manager_email']);

        $managerTemporaryPassword = Str::password(12);

        [$pressing, $reportToken] = DB::transaction(function () use ($data, $pressingFields, $managerTemporaryPassword) {
            $pressing = Pressing::create($pressingFields);
            $reportToken = $pressing->generateReportToken();

            $agency = Agency::create([
                'pressing_id' => $pressing->id,
                'code' => $data['agency_code'],
                'name' => $data['agency_name'],
                'city' => $data['agency_city'] ?? null,
            ]);

            $adminRole = Role::where('slug', 'admin')->firstOrFail();

            User::create([
                'pressing_id' => $pressing->id,
                'agency_id' => null,
                'role_id' => $adminRole->id,
                'name' => $data['manager_name'],
                'email' => $data['manager_email'],
                'password' => Hash::make($managerTemporaryPassword),
                'is_active' => true,
                'must_change_password' => true,
            ]);

            return [$pressing, $reportToken];
        });

        return response()->json(
            $pressing->fresh('platformPlan')->toArray() + [
                'report_token' => $reportToken,
                'manager_email' => $data['manager_email'],
                'manager_temporary_password' => $managerTemporaryPassword,
            ],
            201
        );
    }

    public function show(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePressing($request->user(), $pressing->id);

        return response()->json($pressing->load('platformPlan'));
    }

    public function update(UpdatePressingRequest $request, Pressing $pressing): JsonResponse
    {
        $user = $request->user();
        $this->authorizePressing($user, $pressing->id);

        $data = $request->validated();
        $touchesOnlyLicenseFields = array_diff(array_keys($data), self::LICENSE_FIELDS) === [];

        // Les champs de licence sont accessibles à qui a licenses.manage OU pressings.manage ;
        // tout autre champ (nom, code, contact...) exige pressings.manage — rend la 4e
        // permission de la maquette réellement signifiante plutôt que cosmétique.
        if ($touchesOnlyLicenseFields && $data !== []) {
            if (! $user->hasPermission('licenses.manage') && ! $user->hasPermission('pressings.manage')) {
                $this->authorizePermission($user, 'licenses.manage');
            }
        } else {
            $this->authorizePermission($user, 'pressings.manage');
        }

        $pressing->update($data);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function suspend(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        $pressing->update(['status' => 'suspended']);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function reactivate(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        $pressing->update(['status' => 'active']);

        return response()->json($pressing->fresh('platformPlan'));
    }

    public function rotateReportToken(Request $request, Pressing $pressing): JsonResponse
    {
        $this->authorizePermission($request->user(), 'pressings.manage');
        $this->authorizePressing($request->user(), $pressing->id);

        return response()->json(['report_token' => $pressing->generateReportToken()]);
    }
}
