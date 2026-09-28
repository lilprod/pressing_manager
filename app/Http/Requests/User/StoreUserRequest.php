<?php

namespace App\Http\Requests\User;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('users.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:30'],
            'role_id' => ['required', 'integer', 'exists:roles,id'],
            // Ignoré si l'administrateur agit depuis une agence : son agence s'applique alors d'office.
            'agency_id' => ['nullable', 'integer', 'exists:agencies,id'],
            'photo' => ['nullable', 'image', 'max:2048'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            // Un administrateur/manager d'agence ne peut créer que des comptes de sa propre agence :
            // l'agence est déjà déterminée, la cohérence rôle/agence est vérifiée côté serveur (contrôleur).
            if ($this->user()->agency_id !== null || ! $this->filled('role_id')) {
                return;
            }

            $role = Role::find($this->input('role_id'));
            if ($role !== null && $role->requiresAgency() && ! $this->filled('agency_id')) {
                $validator->errors()->add('agency_id', 'Ce rôle nécessite une agence.');
            }
        });
    }
}
