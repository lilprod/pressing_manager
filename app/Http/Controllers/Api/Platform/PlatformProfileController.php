<?php

namespace App\Http\Controllers\Api\Platform;

use App\Http\Requests\Platform\ChangePlatformPasswordRequest;
use App\Http\Requests\Platform\UpdatePlatformProfileRequest;
use App\Models\PlatformUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Mirrors App\Http\Controllers\Api\ProfileController (tenant) pour le royaume plateforme. */
class PlatformProfileController extends PlatformApiController
{
    public function update(UpdatePlatformProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->safe()->only(['name', 'phone']);

        if ($request->hasFile('photo')) {
            $disk = Storage::disk(config('filesystems.default'));
            if ($user->photo_path !== null) {
                $disk->delete($user->photo_path);
            }
            $data['photo_path'] = $request->file('photo')->store("platform_users/{$user->id}", ['disk' => config('filesystems.default')]);
        }

        $user->update($data);

        return response()->json($user->fresh(['platformRole', 'pressings']));
    }

    public function changePassword(ChangePlatformPasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update([
            'password' => Hash::make($request->validated('new_password')),
            'must_change_password' => false,
        ]);

        return response()->json($user->fresh(['platformRole', 'pressings']));
    }

    public function photo(Request $request, PlatformUser $platformUser): StreamedResponse
    {
        if ($request->user()->id !== $platformUser->id && ! $request->user()->hasPermission('platform_users.manage')) {
            throw new HttpException(403, "Vous n'avez pas accès à cette photo.");
        }

        $disk = Storage::disk(config('filesystems.default'));
        if ($platformUser->photo_path === null || ! $disk->exists($platformUser->photo_path)) {
            throw new HttpException(404, 'Photo introuvable.');
        }

        return $disk->response($platformUser->photo_path);
    }
}
