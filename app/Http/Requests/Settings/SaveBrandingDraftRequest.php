<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Brouillon de branding (CLAUDE.md « Branding — brouillon / publication +
 * versions ») : tous les champs sont `nullable`, c'est un brouillon fusionné
 * (pas un remplacement). Le logo/favicon restent en enregistrement immédiat
 * (endpoint `POST /settings` existant, inchangé) — pas de fichier en attente de
 * publication dans cette passe, pour éviter la complexité d'un cycle de vie de
 * fichier brouillon/publié/orphelin hors scope de ce chantier.
 */
class SaveBrandingDraftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('agencies.manage');
    }

    public function rules(): array
    {
        return [
            'pressing_name' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'website' => ['nullable', 'string', 'max:255', 'url'],
            'legal_notice' => ['nullable', 'string', 'max:2000'],
            'ticket_footer' => ['nullable', 'string', 'max:500'],
            'ticket_conditions' => ['nullable', 'string', 'max:500'],
            'primary_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'monogram' => ['nullable', 'string', 'max:4'],
        ];
    }
}
