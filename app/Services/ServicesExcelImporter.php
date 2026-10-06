<?php

namespace App\Services;

use App\Models\Service;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Import Excel du catalogue (écran "Catalogue articles et tarifs", bouton Importer
 * Excel). **Portée volontairement limitée aux articles facturés à la pièce**
 * (colonnes fixes, pas de mapping interactif) — un article au kilo/mixte exige une
 * grille de prix (structure imbriquée) qu'une ligne de tableur ne peut pas porter
 * proprement ; ces articles restent à créer via le formulaire. Même garantie
 * d'immuabilité que partout ailleurs dans ce service : passe par
 * `ServicePricingService::createService()` (donc hérite du correctif
 * d'attachement aux agences), jamais d'écriture directe en base.
 */
class ServicesExcelImporter
{
    /**
     * @return array{created: int, errors: array<int, array{row: int, errors: array<int, string>}>}
     */
    public function import(string $path, User $actor, ServicePricingService $pricing): array
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, false);

        // Première ligne = en-têtes, ignorée pour la validation (juste un repère visuel).
        $dataRows = array_slice($rows, 1);

        $parsed = [];
        $errors = [];
        $codesSeenInFile = [];

        foreach ($dataRows as $index => $row) {
            $rowNumber = $index + 2; // +1 pour l'en-tête, +1 pour l'indexation à 1.
            if (collect($row)->filter(fn ($v) => $v !== null && $v !== '')->isEmpty()) {
                continue; // Ligne vide ignorée silencieusement (fin de fichier, etc.).
            }

            $data = [
                'code' => trim((string) ($row[0] ?? '')),
                'name' => trim((string) ($row[1] ?? '')),
                'category' => trim((string) ($row[2] ?? '')),
                'base_price' => $row[3] ?? null,
                'estimated_duration_hours' => $row[4] ?? null,
            ];

            $validator = $this->validateRow($data, $actor, $codesSeenInFile);

            if ($validator->fails()) {
                $errors[] = ['row' => $rowNumber, 'errors' => $validator->errors()->all()];

                continue;
            }

            $codesSeenInFile[] = strtolower($data['code']);
            $parsed[] = $data;
        }

        if (! empty($errors)) {
            return ['created' => 0, 'errors' => $errors];
        }

        DB::transaction(function () use ($parsed, $actor, $pricing) {
            foreach ($parsed as $data) {
                $pricing->createService([
                    'code' => $data['code'],
                    'name' => $data['name'],
                    'category' => $data['category'],
                    'billing_mode' => 'piece',
                    'base_price' => (int) $data['base_price'],
                    'estimated_duration_hours' => (int) $data['estimated_duration_hours'],
                    'is_active' => true,
                ], $actor);
            }
        });

        return ['created' => count($parsed), 'errors' => []];
    }

    /** @param  array<int, string>  $codesSeenInFile */
    private function validateRow(array $data, User $actor, array $codesSeenInFile): Validator
    {
        return validator($data, [
            'code' => [
                'required', 'string', 'max:30',
                Rule::unique('services', 'code')->where('pressing_id', $actor->pressing_id),
                function (string $attribute, mixed $value, \Closure $fail) use ($codesSeenInFile) {
                    if (in_array(strtolower((string) $value), $codesSeenInFile, true)) {
                        $fail('Ce code apparaît plusieurs fois dans le fichier.');
                    }
                },
            ],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'in:nettoyage,lavage,repassage,retouche,teinture,autre'],
            'base_price' => ['required', 'integer', 'min:0'],
            'estimated_duration_hours' => ['required', 'integer', 'min:1'],
        ]);
    }
}
