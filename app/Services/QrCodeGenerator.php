<?php

namespace App\Services;

use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Str;

class QrCodeGenerator
{
    /**
     * Code unique et lisible par article, préfixé par le code agence.
     */
    public function generateCode(string $agencyCode): string
    {
        return sprintf('%s-%s', $agencyCode, Str::upper(Str::random(10)));
    }

    /**
     * PNG encodant le code de l'article, à afficher/imprimer sur l'étiquette.
     */
    public function toPngDataUri(string $qrCode): string
    {
        $result = (new Builder(writer: new PngWriter(), data: $qrCode, size: 300, margin: 10))->build();

        return $result->getDataUri();
    }
}
