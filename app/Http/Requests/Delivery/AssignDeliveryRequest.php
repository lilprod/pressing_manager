<?php

namespace App\Http\Requests\Delivery;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AssignDeliveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('deliveries.manage');
    }

    public function rules(): array
    {
        $livreurRoleId = Role::where('slug', 'livreur')->value('id');

        return [
            'livreur_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where('role_id', $livreurRoleId),
            ],
        ];
    }
}
