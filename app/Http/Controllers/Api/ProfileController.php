<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\Profile\ChangePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ProfileController extends ApiController
{
    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->safe()->only(['name', 'phone']);

        if ($request->hasFile('photo')) {
            $disk = Storage::disk(config('filesystems.default'));
            if ($user->photo_path !== null) {
                $disk->delete($user->photo_path);
            }
            $data['photo_path'] = $request->file('photo')->store("users/{$user->id}", ['disk' => config('filesystems.default')]);
        }

        $user->update($data);

        return response()->json($user->fresh()->load('role.permissions', 'agency'));
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update([
            'password' => Hash::make($request->validated('new_password')),
            'must_change_password' => false,
            'password_changed_at' => now(),
        ]);

        return response()->json($user->fresh()->load('role.permissions', 'agency'));
    }

    public function photo(Request $request, User $user): StreamedResponse
    {
        if ($request->user()->id !== $user->id && ! $request->user()->hasPermission('users.manage')) {
            throw new HttpException(403, "Vous n'avez pas accès à cette photo.");
        }

        $disk = Storage::disk(config('filesystems.default'));
        if ($user->photo_path === null || ! $disk->exists($user->photo_path)) {
            throw new HttpException(404, 'Photo introuvable.');
        }

        return $disk->response($user->photo_path);
    }
}
