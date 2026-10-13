<?php

namespace App\Http\Controllers\Api;

use App\Models\FinishOption;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Référentiel des rendus (sur cintre, plié, sous housse…) du pressing. Pas de
 * suppression : un rendu retiré est désactivé, pour ne jamais casser un dépôt qui
 * l'a déjà utilisé (même convention que les types de traitement).
 */
class FinishOptionController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $pressingId = $request->user()->pressing_id;
        FinishOption::seedDefaults($pressingId);

        return response()->json(FinishOption::where('pressing_id', $pressingId)->orderBy('sort_order')->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');
        $pressingId = $request->user()->pressing_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('finish_options', 'name')->where('pressing_id', $pressingId)],
        ]);

        $option = FinishOption::create([
            'pressing_id' => $pressingId,
            'name' => $data['name'],
            'sort_order' => (int) FinishOption::where('pressing_id', $pressingId)->max('sort_order') + 1,
        ]);

        return response()->json($option->refresh(), 201);
    }

    public function update(Request $request, FinishOption $finishOption): JsonResponse
    {
        $this->authorizePermission($request->user(), 'services.manage');
        if ($finishOption->pressing_id !== $request->user()->pressing_id) {
            throw new HttpException(403, 'Ce rendu appartient à un autre pressing.');
        }
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80', Rule::unique('finish_options', 'name')->where('pressing_id', $finishOption->pressing_id)->ignore($finishOption->id)],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $finishOption->update($data);

        return response()->json($finishOption);
    }
}
